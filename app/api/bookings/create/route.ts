import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

function buildVoucherCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''
  for (let i = 0; i < 8; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `LB-${token}`
}

function buildAudienceCheckinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''
  for (let i = 0; i < 6; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `AUD-${token}`
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { eventId, eventArtTypeId } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, credits, role, audience_free_passes_remaining')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(
        'id, title, status, event_type, open_mic_type, variety_use_max_attendees, tickets_enabled, audience_enabled, audience_capacity, audience_deposit_credits, max_attendees, registration_opens_at, venue_id, credits_required, food_coupon_enabled, spot_fee_credits, food_coupon_value_cents, food_coupon_expires_hours, date, end_time'
      )
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.status === 'cancelled') {
      return NextResponse.json({ error: 'Event has been cancelled' }, { status: 400 })
    }
    if (event.event_type === 'booked_show') {
      return NextResponse.json({ error: 'This show is invite-only' }, { status: 400 })
    }
    if (event.tickets_enabled && event.event_type !== 'open_mic') {
      return NextResponse.json({ error: 'This event requires tickets, not booking credits' }, { status: 400 })
    }
    if (event.registration_opens_at && new Date() < new Date(event.registration_opens_at)) {
      return NextResponse.json({ error: 'Registration is not open yet' }, { status: 400 })
    }

    if (profile.role === 'audience' && !event.audience_enabled) {
      return NextResponse.json({ error: 'Audience registration is not enabled for this event' }, { status: 400 })
    }

    const { count: existingBookingCount, error: existingBookingError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('user_id', authData.user.id)
      .in('status', ['confirmed', 'waitlist'])

    if (existingBookingError) {
      return NextResponse.json({ error: existingBookingError.message }, { status: 500 })
    }
    if ((existingBookingCount ?? 0) > 0) {
      return NextResponse.json({ error: 'You already have a booking for this event' }, { status: 400 })
    }

    const isAudienceBooking = profile.role === 'audience'
    const foodCouponEnabled = !isAudienceBooking && !!event.food_coupon_enabled
    const spotFeeCredits = Math.max(0, Number(event.spot_fee_credits || 0))
    const couponValueCents = Math.max(0, Number(event.food_coupon_value_cents || 0))
    const couponCreditsComponent = Math.ceil(couponValueCents / 100)
    const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 1))
    const totalCreditsRequired = isAudienceBooking
      ? audienceDepositCredits
      : foodCouponEnabled
      ? spotFeeCredits + couponCreditsComponent
      : Math.max(0, Number(event.credits_required || 0))

    const hasAudienceFreePass = isAudienceBooking && Number(profile.audience_free_passes_remaining || 0) > 0
    const creditsToDebit = hasAudienceFreePass ? 0 : totalCreditsRequired

    if (profile.credits < creditsToDebit) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    const isVarietyOpenMic = event.event_type === 'open_mic' && (event as any).open_mic_type === 'variety_arts_open_mic'
    const requiresArtTypeSelection = !isAudienceBooking && isVarietyOpenMic
    let selectedArtTypeId: string | null = null
    let selectedArtTypeCapacity: number | null = null

    if (requiresArtTypeSelection) {
      if (!eventArtTypeId || typeof eventArtTypeId !== 'string') {
        return NextResponse.json({ error: 'Please select an art type before booking.' }, { status: 400 })
      }
      const { data: artTypeRow, error: artTypeError } = await supabase
        .from('event_art_types')
        .select('id, slot_capacity')
        .eq('id', eventArtTypeId)
        .eq('event_id', event.id)
        .maybeSingle()
      if (artTypeError || !artTypeRow) {
        return NextResponse.json({ error: 'Invalid art type selected for this event.' }, { status: 400 })
      }
      selectedArtTypeId = artTypeRow.id
      selectedArtTypeCapacity = Number(artTypeRow.slot_capacity || 0)
    }

    const useGlobalVarietyCapacity =
      requiresArtTypeSelection && !!(event as any).variety_use_max_attendees
    const performerCapacity = useGlobalVarietyCapacity
      ? event.max_attendees
      : (selectedArtTypeCapacity ?? event.max_attendees)
    const audienceCapacity = Math.max(0, Number((event as any).audience_capacity || 15))
    const capacityField = isAudienceBooking ? audienceCapacity : performerCapacity
    const capacityScope = isAudienceBooking ? 'audience' : 'performer'

    let confirmedCountQuery = supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('status', 'confirmed')
      .eq('booking_scope', capacityScope)

    if (!isAudienceBooking) {
      if (selectedArtTypeId && !useGlobalVarietyCapacity) {
        confirmedCountQuery = confirmedCountQuery.eq('event_art_type_id', selectedArtTypeId)
      } else if (!selectedArtTypeId) {
        confirmedCountQuery = confirmedCountQuery.is('event_art_type_id', null)
      }
    }

    const { count: confirmedCount, error: confirmedCountError } = await confirmedCountQuery

    if (confirmedCountError) {
      return NextResponse.json({ error: confirmedCountError.message }, { status: 500 })
    }

    const isFull = capacityField !== null && (confirmedCount ?? 0) >= capacityField
    const bookingStatus: 'confirmed' | 'waitlist' = isFull ? 'waitlist' : 'confirmed'

    let audienceCheckinCode: string | null = null
    if (isAudienceBooking) {
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
      if (!audienceCheckinCode) {
        return NextResponse.json({ error: 'Failed to create check-in code' }, { status: 500 })
      }
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id: authData.user.id,
        event_id: event.id,
        credits_used: creditsToDebit,
        status: bookingStatus,
        attendance_status: null,
        booking_scope: isAudienceBooking ? 'audience' : 'performer',
        event_art_type_id: isAudienceBooking ? null : selectedArtTypeId,
        audience_checkin_code: audienceCheckinCode,
      })
      .select('id, user_id, event_id, credits_used, status, booking_scope, event_art_type_id, audience_checkin_code')
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: bookingError?.message || 'Failed to create booking' }, { status: 500 })
    }

    const profilePatch: Record<string, any> = {
      credits: profile.credits - creditsToDebit,
      updated_at: new Date().toISOString(),
    }
    if (hasAudienceFreePass) {
      profilePatch.audience_free_passes_remaining = Math.max(
        0,
        Number(profile.audience_free_passes_remaining || 0) - 1
      )
    }

    const { error: creditUpdateError } = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', authData.user.id)

    if (creditUpdateError) {
      await supabase.from('bookings').delete().eq('id', booking.id)
      return NextResponse.json({ error: creditUpdateError.message }, { status: 500 })
    }

    if (bookingStatus === 'waitlist') {
      await supabase.rpc('update_waitlist_positions_scoped', {
        event_uuid: event.id,
        booking_scope_filter: capacityScope,
        event_art_type_uuid: isAudienceBooking || useGlobalVarietyCapacity ? null : selectedArtTypeId,
        include_all_art_types: useGlobalVarietyCapacity,
      })
    }

    const transactions = []
    if (isAudienceBooking) {
      if (hasAudienceFreePass) {
        transactions.push({
          user_id: authData.user.id,
          amount: 0,
          transaction_type: 'audience_free_pass_used',
          reference_id: booking.id,
          notes: `Audience free pass used: ${event.title}`,
        })
      } else {
        transactions.push({
          user_id: authData.user.id,
          amount: -creditsToDebit,
          transaction_type: 'audience_deposit_hold',
          reference_id: booking.id,
          notes: `Audience deposit held: ${event.title}`,
        })
      }
    } else if (foodCouponEnabled) {
      transactions.push({
        user_id: authData.user.id,
        amount: -spotFeeCredits,
        transaction_type: 'booking_fee',
        reference_id: booking.id,
        notes: `Spot fee for booking: ${event.title}`,
      })
      if (couponCreditsComponent > 0) {
        transactions.push({
          user_id: authData.user.id,
          amount: -couponCreditsComponent,
          transaction_type: 'food_coupon_issued',
          reference_id: booking.id,
          notes: `Food coupon issued (${couponValueCents} cents): ${event.title}`,
        })
      }
    } else {
      transactions.push({
        user_id: authData.user.id,
        amount: -creditsToDebit,
        transaction_type: 'booking',
        reference_id: booking.id,
        notes: `Booked event: ${event.title}`,
      })
    }

    if (transactions.length > 0) {
      await supabase.from('credit_transactions').insert(transactions)
    }

    let voucher: any = null
    if (foodCouponEnabled && bookingStatus === 'confirmed' && couponValueCents > 0) {
      const expiresHours = Math.max(1, Number(event.food_coupon_expires_hours || 24))
      const eventStart = new Date(event.date)
      const fallbackEnd = new Date(eventStart.getTime() + 2 * 60 * 60 * 1000)
      const eventEnd = (event as any).end_time ? new Date((event as any).end_time) : fallbackEnd
      const expiresAt = new Date(eventEnd.getTime() + expiresHours * 60 * 60 * 1000).toISOString()
      const maxAttempts = 5
      let created = null

      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const code = buildVoucherCode()
        const { data: voucherData, error: voucherError } = await supabase
          .from('booking_vouchers')
          .insert({
            booking_id: booking.id,
            event_id: booking.event_id,
            user_id: booking.user_id,
            venue_id: event.venue_id ?? null,
            code,
            value_cents: couponValueCents,
            status: 'issued',
            expires_at: expiresAt,
          })
          .select('id, code, value_cents, status, expires_at')
          .single()

        if (!voucherError && voucherData) {
          created = voucherData
          break
        }

        if (!voucherError?.message?.toLowerCase().includes('duplicate')) {
          break
        }
      }

      if (!created) {
        await supabase.from('bookings').delete().eq('id', booking.id)
        const rollbackPatch: Record<string, any> = {
          credits: profile.credits,
          updated_at: new Date().toISOString(),
        }
        if (hasAudienceFreePass) {
          rollbackPatch.audience_free_passes_remaining = Number(profile.audience_free_passes_remaining || 0)
        }
        await supabase
          .from('profiles')
          .update(rollbackPatch)
          .eq('id', authData.user.id)

        return NextResponse.json({ error: 'Failed to issue food coupon voucher' }, { status: 500 })
      }

      voucher = {
        id: created.id,
        code: created.code,
        valueCents: created.value_cents,
        status: created.status,
        expiresAt: created.expires_at,
      }
    }

    return NextResponse.json({
      bookingId: booking.id,
      bookingStatus: booking.status,
      bookingScope: booking.booking_scope,
      checkinCode: booking.audience_checkin_code,
      creditsDebited: creditsToDebit,
      usedAudienceFreePass: hasAudienceFreePass,
      split: foodCouponEnabled
        ? {
            bookingFeeCredits: spotFeeCredits,
            couponCredits: couponCreditsComponent,
            couponValueCents,
          }
        : null,
      voucher,
    })
  } catch (error: any) {
    console.error('Error creating booking:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

