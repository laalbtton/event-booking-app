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

    const { eventId } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, credits')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(
        'id, title, status, event_type, tickets_enabled, credits_required, max_attendees, registration_opens_at, venue_id, food_coupon_enabled, spot_fee_credits, food_coupon_value_cents, food_coupon_expires_hours'
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
    if (event.tickets_enabled) {
      return NextResponse.json({ error: 'This event requires tickets, not booking credits' }, { status: 400 })
    }
    if (event.registration_opens_at && new Date() < new Date(event.registration_opens_at)) {
      return NextResponse.json({ error: 'Registration is not open yet' }, { status: 400 })
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

    const foodCouponEnabled = !!event.food_coupon_enabled
    const spotFeeCredits = Math.max(0, Number(event.spot_fee_credits || 0))
    const couponValueCents = Math.max(0, Number(event.food_coupon_value_cents || 0))
    const couponCreditsComponent = Math.ceil(couponValueCents / 100)
    const totalCreditsRequired = foodCouponEnabled
      ? spotFeeCredits + couponCreditsComponent
      : Math.max(0, Number(event.credits_required || 0))

    if (profile.credits < totalCreditsRequired) {
      return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
    }

    const { count: confirmedCount, error: confirmedCountError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .eq('status', 'confirmed')

    if (confirmedCountError) {
      return NextResponse.json({ error: confirmedCountError.message }, { status: 500 })
    }

    const isFull = event.max_attendees !== null && (confirmedCount ?? 0) >= event.max_attendees
    const bookingStatus: 'confirmed' | 'waitlist' = isFull ? 'waitlist' : 'confirmed'

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        user_id: authData.user.id,
        event_id: event.id,
        credits_used: totalCreditsRequired,
        status: bookingStatus,
        attendance_status: null,
      })
      .select('id, user_id, event_id, credits_used, status')
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: bookingError?.message || 'Failed to create booking' }, { status: 500 })
    }

    const { error: creditUpdateError } = await supabase
      .from('profiles')
      .update({
        credits: profile.credits - totalCreditsRequired,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authData.user.id)

    if (creditUpdateError) {
      await supabase.from('bookings').delete().eq('id', booking.id)
      return NextResponse.json({ error: creditUpdateError.message }, { status: 500 })
    }

    if (bookingStatus === 'waitlist') {
      await supabase.rpc('update_waitlist_positions', { event_uuid: event.id })
    }

    const transactions = []
    if (foodCouponEnabled) {
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
        amount: -totalCreditsRequired,
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
      const expiresAt = new Date(Date.now() + expiresHours * 60 * 60 * 1000).toISOString()
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
        await supabase
          .from('profiles')
          .update({ credits: profile.credits, updated_at: new Date().toISOString() })
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
      creditsDebited: totalCreditsRequired,
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

