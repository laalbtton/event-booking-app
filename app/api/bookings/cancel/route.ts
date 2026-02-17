import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
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

    const { bookingId } = await request.json()
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, user_id, event_id, credits_used, status')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }
    if (booking.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (booking.status !== 'confirmed' && booking.status !== 'waitlist') {
      return NextResponse.json({ error: 'Booking cannot be cancelled' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select(
        'id, title, date, cancellation_hours, event_type, food_coupon_enabled, spot_fee_credits, food_coupon_value_cents'
      )
      .eq('id', booking.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const now = new Date()
    const eventDate = new Date(event.date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isBookedShow = event.event_type === 'booked_show'
    const cancellationWindow = isBookedShow ? 0 : Number(event.cancellation_hours || 4)
    const refundEligible = booking.status === 'waitlist' || (!isBookedShow && hoursUntilEvent >= cancellationWindow)

    const foodCouponEnabled = !!event.food_coupon_enabled
    const spotFeeCredits = Math.max(0, Number(event.spot_fee_credits || 0))
    const couponValueCents = Math.max(0, Number(event.food_coupon_value_cents || 0))
    const couponCreditsComponent = Math.ceil(couponValueCents / 100)

    const { data: existingVoucher } = await supabase
      .from('booking_vouchers')
      .select('id, status, value_cents')
      .eq('booking_id', booking.id)
      .maybeSingle()

    let voucherRefunded = false
    let refundedCredits = 0

    if (refundEligible && booking.credits_used > 0) {
      if (foodCouponEnabled) {
        if (booking.status === 'waitlist') {
          refundedCredits = booking.credits_used
          voucherRefunded = false
        } else if (existingVoucher?.status === 'redeemed') {
          refundedCredits = Math.min(booking.credits_used, spotFeeCredits)
          voucherRefunded = false
        } else {
          refundedCredits = booking.credits_used
          voucherRefunded = couponCreditsComponent > 0
        }
      } else {
        refundedCredits = booking.credits_used
      }
    }

    let cancelError: any = null
    const withDateUpdate = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_date: now.toISOString() })
      .eq('id', booking.id)

    if (withDateUpdate.error) {
      // Local/dev DB may not have `cancellation_date` yet.
      if (
        withDateUpdate.error.code === '42703' ||
        withDateUpdate.error.message?.includes('cancellation_date')
      ) {
        const fallbackUpdate = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', booking.id)
        cancelError = fallbackUpdate.error || null
      } else {
        cancelError = withDateUpdate.error
      }
    }

    if (cancelError) {
      return NextResponse.json({ error: cancelError.message }, { status: 500 })
    }

    if (existingVoucher && existingVoucher.status === 'issued') {
      await supabase
        .from('booking_vouchers')
        .update({ status: 'cancelled', updated_at: now.toISOString() })
        .eq('id', existingVoucher.id)
    }

    if (refundedCredits > 0) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', authData.user.id)
        .single()

      if (profileError || !profile) {
        return NextResponse.json({ error: profileError?.message || 'Profile not found' }, { status: 500 })
      }

      const { error: refundError } = await supabase
        .from('profiles')
        .update({
          credits: Number(profile.credits || 0) + refundedCredits,
          updated_at: now.toISOString(),
        })
        .eq('id', authData.user.id)

      if (refundError) {
        return NextResponse.json({ error: refundError.message }, { status: 500 })
      }

      await supabase.from('credit_transactions').insert({
        user_id: authData.user.id,
        amount: refundedCredits,
        transaction_type: voucherRefunded ? 'food_coupon_refund' : 'refund',
        reference_id: booking.id,
        notes: `Refund for cancelled booking: ${event.title}`,
      })
    } else {
      await supabase.from('credit_transactions').insert({
        user_id: authData.user.id,
        amount: 0,
        transaction_type: 'cancellation_no_refund',
        reference_id: booking.id,
        notes: `Cancelled booking without refund: ${event.title}`,
      })
    }

    if (booking.status === 'confirmed') {
      await supabase.rpc('promote_waitlist_and_update_positions', { event_uuid: booking.event_id })
    } else {
      await supabase.rpc('update_waitlist_positions', { event_uuid: booking.event_id })
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      refundedCredits,
      voucherRefunded,
    })
  } catch (error: any) {
    console.error('Error cancelling booking:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

