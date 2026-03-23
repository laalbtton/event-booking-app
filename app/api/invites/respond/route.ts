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

    const { inviteId, action } = await request.json()
    if (!inviteId || (action !== 'accept' && action !== 'decline')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('event_invites')
      .select('id, event_id, invited_user_id, status')
      .eq('id', inviteId)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    if (invite.invited_user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite already handled' }, { status: 400 })
    }

    if (action === 'decline') {
      const { error: declineError } = await supabase
        .from('event_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId)

      if (declineError) {
        return NextResponse.json({ error: declineError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, max_attendees, event_type, credits_required, cancellation_hours')
      .eq('id', invite.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { count: existingBooking } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', invite.event_id)
      .eq('user_id', authData.user.id)
      .in('status', ['confirmed', 'waitlist'])

    const creditsRequired = event.credits_required ?? 0

    if ((existingBooking ?? 0) === 0) {
      // Deduct credits if the event charges performers
      if (creditsRequired > 0) {
        const { data: creditData } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', authData.user.id)
          .single()

        const currentCredits = creditData?.credits ?? 0
        if (currentCredits < creditsRequired) {
          return NextResponse.json(
            { error: `Insufficient credits. You need ${creditsRequired} but have ${currentCredits}.` },
            { status: 400 }
          )
        }

        await supabase
          .from('profiles')
          .update({ credits: currentCredits - creditsRequired })
          .eq('id', authData.user.id)

        await supabase.from('credit_transactions').insert({
          user_id: authData.user.id,
          amount: -creditsRequired,
          transaction_type: 'booking',
          description: `Booked show invite accepted`,
          event_id: invite.event_id,
        })
      }

      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: authData.user.id,
          event_id: invite.event_id,
          credits_used: creditsRequired,
          status: 'confirmed',
          booking_scope: 'performer',
          attendance_status: null,
        })

      if (bookingError) {
        return NextResponse.json({ error: bookingError.message }, { status: 500 })
      }
    }

    const { error: acceptError } = await supabase
      .from('event_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId)

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 500 })
    }

    // Keep max_attendees in sync for booked shows
    if (event.event_type === 'booked_show' && event.max_attendees !== null) {
      const { count: confirmedCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', invite.event_id)
        .eq('status', 'confirmed')

      await supabase
        .from('events')
        .update({ max_attendees: confirmedCount ?? 0 })
        .eq('id', invite.event_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error responding to invite:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
