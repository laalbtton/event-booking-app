import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

type RefundMode = 'full' | 'specific'

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

    const { eventId, bookingIds, mode, specificAmount } = await request.json()
    const refundMode: RefundMode = mode === 'specific' ? 'specific' : 'full'

    if (!eventId || !Array.isArray(bookingIds) || bookingIds.length === 0) {
      return NextResponse.json({ error: 'Missing eventId or bookingIds' }, { status: 400 })
    }

    const requestedAmount = Number(specificAmount || 0)
    if (refundMode === 'specific' && (!Number.isFinite(requestedAmount) || requestedAmount <= 0)) {
      return NextResponse.json({ error: 'Specific refund amount must be greater than 0' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, created_by, host_user_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canManage =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id

    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, event_id, user_id, credits_used, status')
      .eq('event_id', eventId)
      .in('id', bookingIds)

    if (bookingsError || !bookings) {
      return NextResponse.json({ error: bookingsError?.message || 'Failed to load bookings' }, { status: 500 })
    }

    if (bookings.length === 0) {
      return NextResponse.json({ error: 'No matching bookings found for this event' }, { status: 404 })
    }

    const uniqueUserIds = Array.from(new Set(bookings.map((b) => b.user_id)))
    const bookingIdSet = bookings.map((b) => b.id)

    const [{ data: attendeeProfiles, error: attendeeProfilesError }, { data: priorRefunds, error: priorRefundsError }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, credits, credits_complimentary')
        .in('id', uniqueUserIds),
      supabase
        .from('credit_transactions')
        .select('reference_id, amount, transaction_type')
        .in('reference_id', bookingIdSet),
    ])

    if (attendeeProfilesError || !attendeeProfiles) {
      return NextResponse.json({ error: attendeeProfilesError?.message || 'Failed to load attendee profiles' }, { status: 500 })
    }
    if (priorRefundsError) {
      return NextResponse.json({ error: priorRefundsError.message }, { status: 500 })
    }

    const profileMap = new Map(
      attendeeProfiles.map((row) => [String((row as { id: string }).id), row as { id: string; credits: number }])
    )
    const refundedByBooking = new Map<string, number>()
    for (const tx of priorRefunds || []) {
      const txType = String(tx.transaction_type || '')
      const eligible =
        tx.amount > 0 &&
        (txType === 'refund' ||
          txType === 'manual_refund' ||
          txType === 'audience_deposit_return' ||
          txType === 'food_coupon_refund')
      if (!eligible) continue
      const key = String(tx.reference_id || '')
      refundedByBooking.set(key, (refundedByBooking.get(key) || 0) + Number(tx.amount || 0))
    }

    const results: Array<{ bookingId: string; userId: string; refunded: number; skippedReason?: string }> = []
    for (const booking of bookings) {
      const attendee = profileMap.get(booking.user_id)
      if (!attendee) {
        results.push({ bookingId: booking.id, userId: booking.user_id, refunded: 0, skippedReason: 'Attendee profile missing' })
        continue
      }

      const paidCredits = Math.max(0, Number(booking.credits_used || 0))
      const alreadyRefunded = Math.max(0, Number(refundedByBooking.get(booking.id) || 0))
      const refundableRemaining = Math.max(0, paidCredits - alreadyRefunded)
      if (refundableRemaining <= 0) {
        results.push({ bookingId: booking.id, userId: booking.user_id, refunded: 0, skippedReason: 'No refundable credits remaining' })
        continue
      }

      const refundAmount =
        refundMode === 'full'
          ? refundableRemaining
          : Math.max(0, Math.min(refundableRemaining, Math.floor(requestedAmount)))

      if (refundAmount <= 0) {
        results.push({ bookingId: booking.id, userId: booking.user_id, refunded: 0, skippedReason: 'Refund amount is 0 after cap' })
        continue
      }

      const { error: creditError } = await supabase
        .from('profiles')
        .update({
          credits: Number(attendee.credits || 0) + refundAmount,
          credits_complimentary: (attendee.credits_complimentary ?? 0) + refundAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', booking.user_id)

      if (creditError) {
        results.push({ bookingId: booking.id, userId: booking.user_id, refunded: 0, skippedReason: creditError.message })
        continue
      }

      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: booking.user_id,
          amount: refundAmount,
          transaction_type: 'manual_refund',
          reference_id: booking.id,
          notes: `Batch refund for ${event.title}`,
          created_by: authData.user.id,
        })

      if (txError) {
        results.push({ bookingId: booking.id, userId: booking.user_id, refunded: 0, skippedReason: txError.message })
        continue
      }

      results.push({ bookingId: booking.id, userId: booking.user_id, refunded: refundAmount })
    }

    const refundedTotal = results.reduce((sum, item) => sum + item.refunded, 0)
    const refundedCount = results.filter((item) => item.refunded > 0).length
    const skippedCount = results.length - refundedCount

    return NextResponse.json({
      success: true,
      refundedCount,
      skippedCount,
      refundedTotal,
      results,
    })
  } catch (error: unknown) {
    console.error('Error processing batch refunds:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

