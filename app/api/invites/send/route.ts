import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/server/push'

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

    const { eventId, invitedUserId } = await request.json()
    if (!eventId || !invitedUserId) {
      return NextResponse.json({ error: 'Missing eventId or invitedUserId' }, { status: 400 })
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
      .select('id, title, created_by, host_user_id, event_type')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.event_type !== 'booked_show') {
      return NextResponse.json({ error: 'Invites only apply to booked shows' }, { status: 400 })
    }

    const canInvite =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id

    if (!canInvite) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { count: existingBooking } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('user_id', invitedUserId)
      .in('status', ['confirmed', 'waitlist'])

    if ((existingBooking ?? 0) > 0) {
      return NextResponse.json({ error: 'User already booked' }, { status: 400 })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('event_invites')
      .insert({
        event_id: eventId,
        invited_user_id: invitedUserId,
        invited_by: authData.user.id,
        status: 'pending',
      })
      .select()
      .single()

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }

    const eventTitle = event.title || 'Event'
    try {
      await createNotification(
        invitedUserId,
        'general',
        'Event Invite',
        `You're invited to "${eventTitle}"`,
        null,
        eventId
      )
    } catch (notifErr) {
      console.warn('Failed to create invite notification:', notifErr)
    }

    try {
      await sendPushToUser(
        supabase,
        invitedUserId,
        {
          title: 'Event Invite',
          body: `You're invited to "${eventTitle}"`,
          data: { url: `/events/${eventId}` },
        },
        'booking_updates'
      )
    } catch (pushErr) {
      console.warn('Failed to send invite push:', pushErr)
    }

    return NextResponse.json({ success: true, invite })
  } catch (error: any) {
    console.error('Error sending invite:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
