import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, getHostCancellationEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { buildEventUrl, getSiteUrl } from '@/lib/server/emailUrl'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * POST /api/bookings/host-cancel
 * Body: { bookingId: string, hostNote?: string }
 *
 * Cancels a booking on behalf of the host/admin. Refunds credits to the
 * performer and sends them an email notification (with optional host note).
 * Then promotes the next waitlisted performer.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const bookingId = typeof body?.bookingId === 'string' ? body.bookingId.trim() : ''
    const hostNote: string | null = typeof body?.hostNote === 'string' && body.hostNote.trim()
      ? body.hostNote.trim()
      : null

    if (!bookingId) return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })

    // Load booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, user_id, event_id, credits_used, credits_purchased_used, credits_complimentary_used, credits_venue_used, status, booking_scope, event_art_type_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (booking.status !== 'confirmed' && booking.status !== 'waitlist') {
      return NextResponse.json({ error: 'Booking cannot be cancelled' }, { status: 400 })
    }

    // Load event — to verify caller is host or admin
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, host_user_id, created_by, event_type, open_mic_type, variety_use_max_attendees, max_attendees, audience_capacity, slug')
      .eq('id', booking.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    // Permission check: must be host, event creator, or admin
    const callerId = authData.user.id
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', callerId)
      .maybeSingle()
    const isAdmin = (callerProfile as { role?: string } | null)?.role === 'admin'
    const isHost = event.host_user_id === callerId || event.created_by === callerId

    if (!isAdmin && !isHost) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Load the performer's profile for the email
    const { data: performerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email, credits, credits_purchased, credits_complimentary')
      .eq('id', booking.user_id)
      .single()

    if (!performerProfile) {
      return NextResponse.json({ error: 'Performer profile not found' }, { status: 404 })
    }

    const now = new Date()

    // Cancel the booking
    const { error: cancelError } = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_date: now.toISOString() })
      .eq('id', bookingId)

    if (cancelError) {
      // Fallback if cancellation_date column doesn't exist yet
      if (cancelError.code === '42703' || cancelError.message?.includes('cancellation_date')) {
        const { error: fallback } = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', bookingId)
        if (fallback) return NextResponse.json({ error: fallback.message }, { status: 500 })
      } else {
        return NextResponse.json({ error: cancelError.message }, { status: 500 })
      }
    }

    // Always refund credits for host-initiated cancellations (regardless of cancellation window)
    const creditsToRefund = Number(booking.credits_used || 0)
    const purchasedUsed = Number(booking.credits_purchased_used || 0)
    const complimentaryUsed = Number(booking.credits_complimentary_used || 0)
    const venueUsed = Number((booking as any).credits_venue_used || 0)
    const hasLedgerSplit = purchasedUsed > 0 || complimentaryUsed > 0

    if (creditsToRefund > 0) {
      const profilePatch: Record<string, unknown> = {
        credits: Number(performerProfile.credits || 0) + creditsToRefund,
        updated_at: now.toISOString(),
      }
      if (hasLedgerSplit) {
        profilePatch.credits_purchased = (performerProfile.credits_purchased ?? 0) + purchasedUsed
        profilePatch.credits_complimentary = (performerProfile.credits_complimentary ?? 0) + complimentaryUsed
      }

      await supabase
        .from('profiles')
        .update(profilePatch)
        .eq('id', booking.user_id)

      await supabase.from('credit_transactions').insert({
        user_id: booking.user_id,
        amount: creditsToRefund,
        transaction_type: 'refund',
        reference_id: bookingId,
        notes: `Spot removed by host: ${event.title}`,
      })
    }

    // Restore venue credits if any were applied
    if (venueUsed > 0 && event.id) {
      // Find the grant(s) that were used — restore in reverse FIFO (simplest: top up the first non-full grant)
      const { data: grants } = await supabase
        .from('venue_credit_grants')
        .select('id, credits_total, credits_remaining')
        .eq('user_id', booking.user_id)
        .eq('venue_id', (event as any).venue_id ?? '')
        .order('issued_at', { ascending: false })
        .limit(5)

      let toRestore = venueUsed
      for (const grant of grants ?? []) {
        if (toRestore <= 0) break
        const space = (grant.credits_total as number) - (grant.credits_remaining as number)
        const restore = Math.min(space, toRestore)
        if (restore > 0) {
          await supabase
            .from('venue_credit_grants')
            .update({ credits_remaining: (grant.credits_remaining as number) + restore })
            .eq('id', grant.id)
          toRestore -= restore
        }
      }
    }

    // Promote next from waitlist (if the cancelled booking was confirmed)
    const isVarietyPerformer =
      booking.booking_scope !== 'audience' &&
      event.event_type === 'open_mic' &&
      (event as any).open_mic_type === 'variety_arts_open_mic'
    const useGlobalVarietyCapacity = isVarietyPerformer && !!(event as any).variety_use_max_attendees

    let scopedCapacity: number | null = booking.booking_scope === 'audience'
      ? Math.max(0, Number((event as any).audience_capacity || 0))
      : event.max_attendees

    if (isVarietyPerformer && booking.event_art_type_id && !useGlobalVarietyCapacity) {
      const { data: artTypeRow } = await supabase
        .from('event_art_types')
        .select('slot_capacity')
        .eq('id', booking.event_art_type_id)
        .maybeSingle()
      scopedCapacity = Number(artTypeRow?.slot_capacity || 0)
    }

    const bookingScopeFilter = booking.booking_scope === 'audience' ? 'audience' : 'performer'

    if (booking.status === 'confirmed') {
      await supabase.rpc('promote_waitlist_and_update_positions_scoped', {
        event_uuid: booking.event_id,
        booking_scope_filter: bookingScopeFilter,
        event_art_type_uuid: isVarietyPerformer && !useGlobalVarietyCapacity ? booking.event_art_type_id : null,
        capacity_limit: scopedCapacity,
        include_all_art_types: useGlobalVarietyCapacity,
      })
    } else {
      await supabase.rpc('update_waitlist_positions_scoped', {
        event_uuid: booking.event_id,
        booking_scope_filter: bookingScopeFilter,
        event_art_type_uuid: isVarietyPerformer && !useGlobalVarietyCapacity ? booking.event_art_type_id : null,
        include_all_art_types: useGlobalVarietyCapacity,
      })
    }

    // Send email notification to the performer
    const performerName = (performerProfile as any).full_name || 'Performer'
    const performerEmail = (performerProfile as any).email
    const eventSlug = (event as any).slug || event.id
    const eventUrl = buildEventUrl(eventSlug) ?? `${getSiteUrl()}/events/${event.id}`
    const eventDate = formatDateTimeEastern(event.date)

    if (performerEmail) {
      const html = getHostCancellationEmail({
        userName: performerName,
        eventTitle: event.title,
        eventDate,
        creditsRefunded: creditsToRefund,
        hostNote,
        eventUrl,
      })
      await sendEmail({
        to: performerEmail,
        subject: `Your spot at "${event.title}" has been removed`,
        html,
      })
    }

    return NextResponse.json({
      success: true,
      bookingId,
      creditsRefunded: creditsToRefund,
      emailSent: !!performerEmail,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
