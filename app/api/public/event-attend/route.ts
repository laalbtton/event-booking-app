import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { isValidEmail, normalizeEmail } from '@/lib/foundingMembers'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { getGuestAttendConfirmationEmail, sendEmail } from '@/lib/email'
import { buildEventUrl, getSiteUrl } from '@/lib/server/emailUrl'
import { clampGuestPartySize, spotsForBooking, sumConfirmedAudienceSpots } from '@/lib/bookingPartySize'

function formatLocation(value: unknown): string {
  if (!value) return 'TBD'
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || 'TBD'
  }
  if (typeof value === 'object') {
    const v = value as { name?: string; address?: string; city?: string }
    const parts = [v.name, v.address, v.city].map((p) => String(p || '').trim()).filter(Boolean)
    if (parts.length) return parts.join(', ')
  }
  return 'TBD'
}

function buildAudienceCheckinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''
  for (let i = 0; i < 6; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `AUD-${token}`
}

function firstNameFrom(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0]
  return first || 'there'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const emailRaw = typeof body?.email === 'string' ? body.email : ''
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    const eventSlug = typeof body?.eventSlug === 'string' ? body.eventSlug.trim() : ''
    const requestedSpots = clampGuestPartySize(body?.quantity ?? body?.partySize ?? 1)

    if (!name || name.length < 2) {
      return NextResponse.json({ error: 'Please enter your name' }, { status: 400 })
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 })
    }
    if (!eventId) {
      return NextResponse.json({ error: 'Missing event' }, { status: 400 })
    }

    const email = normalizeEmail(emailRaw)

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(
        'id, slug, title, date, end_time, location, status, event_type, tickets_enabled, external_event, external_ticket_url, audience_capacity, registration_opens_at',
      )
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (event.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 })
    }

    const end = event.end_time ? new Date(event.end_time) : new Date(event.date)
    if (end.getTime() < Date.now()) {
      return NextResponse.json({ error: 'This event has already taken place' }, { status: 400 })
    }
    if (event.registration_opens_at && new Date(event.registration_opens_at) > new Date()) {
      return NextResponse.json({ error: 'Registration is not open yet' }, { status: 400 })
    }
    if (event.external_event && event.external_ticket_url) {
      return NextResponse.json({ error: 'This event uses external tickets' }, { status: 400 })
    }

    if (event.tickets_enabled) {
      const { data: ticket } = await supabase
        .from('event_tickets')
        .select('price_cents')
        .eq('event_id', event.id)
        .maybeSingle()
      if (ticket && Number(ticket.price_cents || 0) > 0) {
        return NextResponse.json({ error: 'This event uses paid tickets' }, { status: 400 })
      }
    }

    const slug = eventSlug || event.slug || event.id
    const callbackUrl = `${getSiteUrl()}/auth/callback?returnTo=${encodeURIComponent(`/events/${slug}`)}`

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: callbackUrl },
    })

    const userId = linkData?.user?.id
    const magicLinkUrl = linkData?.properties?.action_link
    if (linkError || !userId || !magicLinkUrl) {
      console.error('guest attend generateLink error:', linkError)
      return NextResponse.json(
        { error: linkError?.message || 'Could not save your spot. Try again in a moment.' },
        { status: 500 },
      )
    }

    await supabase.auth.admin.updateUserById(userId, {
      user_metadata: {
        full_name: name,
        onboarding_role_pending: false,
      },
      email_confirm: true,
    })

    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', userId)
      .maybeSingle()

    const profilePayload: Record<string, unknown> = {
      id: userId,
      email,
      full_name: existingProfile?.full_name?.trim() ? existingProfile.full_name : name,
      updated_at: new Date().toISOString(),
    }
    if (!existingProfile?.role) {
      profilePayload.role = 'audience'
    }

    const { error: profileError } = await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' })
    if (profileError) {
      console.error('guest attend profile upsert error:', profileError)
    }

    const { data: existingRows, error: existingError } = await supabase
      .from('bookings')
      .select('id, status, booking_scope, audience_checkin_code, party_size')
      .eq('event_id', event.id)
      .eq('user_id', userId)
      .in('status', ['confirmed', 'waitlist', 'interested', 'cancelled'])
      .order('booked_at', { ascending: false })

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }

    const existing = (existingRows || [])[0] as
      | {
          id: string
          status: string
          booking_scope?: string | null
          audience_checkin_code?: string | null
          party_size?: number | null
        }
      | undefined

    if (existing && (existing.booking_scope || 'performer') !== 'audience') {
      return NextResponse.json({
        success: true,
        alreadyBooked: true,
        bookingStatus: existing.status,
        partySize: spotsForBooking(existing),
      })
    }

    const audienceCapacityRaw = Number(event.audience_capacity || 0)
    const audienceCapacity = audienceCapacityRaw > 0 ? audienceCapacityRaw : null
    const { spots: goingSpots, error: goingCountError } = await sumConfirmedAudienceSpots(supabase, event.id)

    if (goingCountError) {
      return NextResponse.json({ error: goingCountError.message }, { status: 500 })
    }

    const existingConfirmedSpots =
      existing?.status === 'confirmed' && (existing.booking_scope || 'performer') === 'audience'
        ? spotsForBooking(existing)
        : 0
    const remainingSpots =
      audienceCapacity != null ? Math.max(0, audienceCapacity - (goingSpots - existingConfirmedSpots)) : null

    const existingPartySize = existing ? spotsForBooking(existing) : 0
    const alreadyHeld =
      existing &&
      (existing.status === 'confirmed' || existing.status === 'waitlist') &&
      (existing.booking_scope || 'performer') === 'audience'

    let partySize = requestedSpots
    let bookingStatus: 'confirmed' | 'waitlist'
    if (alreadyHeld && existing?.status === 'waitlist') {
      bookingStatus = 'waitlist'
      partySize = Math.max(existingPartySize, requestedSpots)
    } else if (remainingSpots == null) {
      bookingStatus = 'confirmed'
      partySize = alreadyHeld ? Math.max(existingPartySize, requestedSpots) : requestedSpots
    } else if (remainingSpots <= 0) {
      bookingStatus = alreadyHeld && existing?.status === 'confirmed' ? 'confirmed' : 'waitlist'
      partySize = alreadyHeld ? existingPartySize : requestedSpots
    } else {
      bookingStatus = 'confirmed'
      const desired = alreadyHeld ? Math.max(existingPartySize, requestedSpots) : requestedSpots
      partySize = Math.min(desired, remainingSpots)
    }

    const unchanged =
      alreadyHeld &&
      existing?.status === bookingStatus &&
      existingPartySize === partySize

    if (unchanged) {
      return NextResponse.json({
        success: true,
        alreadyBooked: true,
        bookingStatus,
        partySize,
      })
    }

    let audienceCheckinCode = existing?.audience_checkin_code || null
    if (bookingStatus === 'confirmed' && !audienceCheckinCode) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = buildAudienceCheckinCode()
        const { data: existingCode } = await supabase
          .from('bookings')
          .select('id')
          .eq('audience_checkin_code', candidate)
          .maybeSingle()
        if (!existingCode) {
          audienceCheckinCode = candidate
          break
        }
      }
    }

    let bookingId = existing?.id
    if (existing && (existing.status === 'confirmed' || existing.status === 'waitlist' || existing.status === 'interested' || existing.status === 'cancelled')) {
      const { data: updated, error: updateError } = await supabase
        .from('bookings')
        .update({
          status: bookingStatus,
          booking_scope: 'audience',
          credits_used: 0,
          party_size: partySize,
          audience_checkin_code: audienceCheckinCode,
          cancellation_date: null,
        })
        .eq('id', existing.id)
        .select('id, status, party_size')
        .single()
      if (updateError || !updated) {
        return NextResponse.json({ error: updateError?.message || 'Failed to save your spot' }, { status: 500 })
      }
      bookingId = updated.id
      bookingStatus = updated.status as 'confirmed' | 'waitlist'
      partySize = spotsForBooking(updated)
    } else {
      const { data: booking, error: insertError } = await supabase
        .from('bookings')
        .insert({
          user_id: userId,
          event_id: event.id,
          credits_used: 0,
          status: bookingStatus,
          attendance_status: null,
          booking_scope: 'audience',
          party_size: partySize,
          audience_checkin_code: audienceCheckinCode,
        })
        .select('id, status, party_size')
        .single()
      if (insertError || !booking) {
        return NextResponse.json({ error: insertError?.message || 'Failed to save your spot' }, { status: 500 })
      }
      bookingId = booking.id
      bookingStatus = booking.status as 'confirmed' | 'waitlist'
      partySize = spotsForBooking(booking)
    }

    const eventUrl = buildEventUrl(slug) || `${getSiteUrl()}/events/${slug}`
    const html = getGuestAttendConfirmationEmail({
      userName: firstNameFrom(name),
      eventTitle: event.title,
      eventDate: formatDateTimeEastern(event.date),
      eventLocation: formatLocation(event.location),
      eventUrl,
      magicLinkUrl,
      waitlisted: bookingStatus === 'waitlist',
      partySize,
    })

    const sent = await sendEmail({
      to: email,
      subject:
        bookingStatus === 'waitlist'
          ? `Waitlisted: ${event.title}`
          : `You're booked: ${event.title}`,
      html,
    })

    if (!sent) {
      console.error('guest attend confirmation email failed', { email, eventId: event.id, bookingId })
    }

    return NextResponse.json({
      success: true,
      bookingStatus,
      partySize,
      requestedSpots,
      capped: bookingStatus === 'confirmed' && partySize < requestedSpots,
      emailSent: sent,
    })
  } catch (error: unknown) {
    console.error('guest event-attend error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not save your spot' },
      { status: 500 },
    )
  }
}
