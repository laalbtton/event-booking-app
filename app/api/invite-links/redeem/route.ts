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

    const body = await request.json()
    const { inviteToken, communityId } = body
    if (!inviteToken) {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
    }

    const { data: link, error: linkError } = await supabase
      .from('event_invite_links')
      .select('id, event_id, token, max_uses, uses, expires_at')
      .eq('token', inviteToken)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Invite link not found' }, { status: 404 })
    }

    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite link has expired' }, { status: 400 })
    }

    if (link.uses >= link.max_uses) {
      return NextResponse.json({ error: 'Invite link has reached its limit' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, event_type')
      .eq('id', link.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.event_type !== 'booked_show') {
      return NextResponse.json({ error: 'Invite link invalid for this event type' }, { status: 400 })
    }

    const { count: existingBooking } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', link.event_id)
      .eq('user_id', authData.user.id)
      .in('status', ['confirmed', 'waitlist'])

    if ((existingBooking ?? 0) === 0) {
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: authData.user.id,
          event_id: link.event_id,
          credits_used: 0,
          status: 'confirmed',
          attendance_status: null,
        })

      if (bookingError) {
        return NextResponse.json({ error: bookingError.message }, { status: 500 })
      }

      await supabase
        .from('event_invite_links')
        .update({ uses: link.uses + 1 })
        .eq('id', link.id)
    }

    // If a communityId was provided, auto-join that community
    if (communityId) {
      const { data: community } = await supabase
        .from('communities')
        .select('id, status, is_public')
        .eq('id', communityId)
        .single()

      if (community && (community as { status: string; is_public: boolean }).status === 'active') {
        // Ignore duplicate-key errors (user already a member)
        await supabase
          .from('community_members')
          .insert({ community_id: communityId, user_id: authData.user.id, role: 'member' })
          .then(null, () => null)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error redeeming invite link:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
