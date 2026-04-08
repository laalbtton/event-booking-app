import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { sendPushToAllUsers } from '@/lib/server/push'

type ProfileRoleRow = { id: string; role?: string } | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdminOrEventCreator(supabase: any, userId: string, eventId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as ProfileRoleRow)?.role === 'admin') return true

  const { data: adminFallback } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (adminFallback) return true

  const { data: event } = await supabase
    .from('events')
    .select('id, created_by')
    .eq('id', eventId)
    .maybeSingle()
  return event?.created_by === userId
}

/** Community admin / co_admin for the event's primary community may broadcast when an event goes live. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isCommunityAdminForPrimaryLink(supabase: any, userId: string, eventId: string) {
  const { data: rows } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', eventId)
    .eq('is_primary', true)
    .eq('status', 'approved')

  const communityIds = Array.from(
    new Set((rows || []).map((r: { community_id: string }) => r.community_id).filter(Boolean))
  )
  if (communityIds.length === 0) return false

  const { data: memberships } = await supabase
    .from('community_members')
    .select('role')
    .eq('user_id', userId)
    .in('community_id', communityIds)

  return (memberships || []).some((m: { role: string }) =>
    ['admin', 'co_admin'].includes(m.role || '')
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function canTriggerNewEventBroadcast(supabase: any, userId: string, eventId: string) {
  if (await isAdminOrEventCreator(supabase, userId, eventId)) return true
  return isCommunityAdminForPrimaryLink(supabase, userId, eventId)
}

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
    const eventId = typeof body?.eventId === 'string' ? body.eventId.trim() : ''
    if (!eventId) return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })

    const allowed = await canTriggerNewEventBroadcast(supabase, authData.user.id, eventId)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, location')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const result = await sendPushToAllUsers(
      supabase,
      {
        title: 'New event added',
        body: `"${event.title}" is now available. Check it out!`,
        data: { url: `/events/${event.id}` },
      },
      'new_events'
    )

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      skippedUsers: result.skippedUsers,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error in events/notify-new:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
