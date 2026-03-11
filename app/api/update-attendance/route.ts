import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      )
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

    const { bookingId, status } = await request.json()
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, event_id, user_id, status, booking_scope, credits_used, credits_purchased_used, credits_complimentary_used, attendance_status, audience_deposit_returned_at')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, created_by, host_user_id, title, date, audience_attendance_open_before_minutes, audience_attendance_cutoff_hours')
      .eq('id', booking.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canUpdate =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id

    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const nextStatus = status === 'attended' ? 'attended' : null

    if (booking.booking_scope === 'audience') {
      const now = new Date()
      const eventStart = new Date(event.date)
      const openBeforeMinutes = Math.max(0, Number(event.audience_attendance_open_before_minutes || 30))
      const cutoffHours = Math.max(0, Number(event.audience_attendance_cutoff_hours || 2))
      const windowOpenAt = new Date(eventStart.getTime() - openBeforeMinutes * 60 * 1000)
      const windowClosesAt = new Date(eventStart.getTime() + cutoffHours * 60 * 60 * 1000)

      if (now < windowOpenAt || now > windowClosesAt) {
        return NextResponse.json(
          { error: 'Audience attendance can only be marked during the configured attendance window' },
          { status: 400 }
        )
      }

      if (nextStatus !== 'attended' && booking.audience_deposit_returned_at) {
        return NextResponse.json(
          { error: 'Attendance cannot be unset after the audience deposit has been returned' },
          { status: 400 }
        )
      }
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        attendance_status: nextStatus,
        attendance_marked_at: nextStatus === 'attended' ? new Date().toISOString() : null,
      })
      .eq('id', bookingId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    let refundedCredits = 0
    if (
      booking.booking_scope === 'audience' &&
      nextStatus === 'attended' &&
      !booking.audience_deposit_returned_at &&
      Number(booking.credits_used || 0) > 0
    ) {
      const { data: attendeeProfile, error: attendeeError } = await supabase
        .from('profiles')
        .select('credits, credits_purchased, credits_complimentary')
        .eq('id', booking.user_id)
        .single()

      if (attendeeError || !attendeeProfile) {
        return NextResponse.json({ error: attendeeError?.message || 'Profile not found' }, { status: 500 })
      }

      refundedCredits = Number(booking.credits_used || 0)
      const purchasedUsed = booking.credits_purchased_used ?? 0
      const complimentaryUsed = booking.credits_complimentary_used ?? 0
      const hasLedgerSplit = purchasedUsed > 0 || complimentaryUsed > 0

      const profilePatch: Record<string, unknown> = {
        credits: Number(attendeeProfile.credits || 0) + refundedCredits,
        updated_at: new Date().toISOString(),
      }
      if (hasLedgerSplit) {
        profilePatch.credits_purchased = (attendeeProfile.credits_purchased ?? 0) + purchasedUsed
        profilePatch.credits_complimentary = (attendeeProfile.credits_complimentary ?? 0) + complimentaryUsed
      }

      const { error: creditError } = await supabase
        .from('profiles')
        .update(profilePatch)
        .eq('id', booking.user_id)

      if (creditError) {
        return NextResponse.json({ error: creditError.message }, { status: 500 })
      }

      const { error: bookingPatchError } = await supabase
        .from('bookings')
        .update({ audience_deposit_returned_at: nowIso })
        .eq('id', booking.id)

      if (bookingPatchError) {
        return NextResponse.json({ error: bookingPatchError.message }, { status: 500 })
      }

      await supabase.from('credit_transactions').insert({
        user_id: booking.user_id,
        amount: refundedCredits,
        transaction_type: 'audience_deposit_return',
        reference_id: booking.id,
        notes: `Audience deposit returned after attendance: ${event.title}`,
      })

      await supabase.rpc('create_notification', {
        p_user_id: booking.user_id,
        p_type: 'general',
        p_title: 'Deposit returned',
        p_message: `You were marked present for "${event.title}". ${refundedCredits} credit${refundedCredits > 1 ? 's were' : ' was'} returned to your account.`,
        p_related_booking_id: booking.id,
        p_related_event_id: event.id,
      })
    }

    return NextResponse.json({ success: true, refundedCredits })
  } catch (error: any) {
    console.error('Error updating attendance:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
