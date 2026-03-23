import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: communityId } = await params

    // Verify the requester is admin/co_admin of this community or a platform admin
    const [membershipRes, profileRes] = await Promise.all([
      supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', authData.user.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .maybeSingle(),
    ])

    const communityRole = (membershipRes.data as { role?: string } | null)?.role
    const platformRole = (profileRes.data as { role?: string } | null)?.role
    const isPlatformAdmin = platformRole === 'admin'
    const isCommunityAdmin = ['admin', 'co_admin'].includes(communityRole || '')

    if (!isPlatformAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Strategy 1: find events via event_communities (primary link, status pending)
    // Strategy 2 (fallback): find events created by community members that are pending_approval
    // We combine both to ensure nothing is missed regardless of whether the
    // event_communities row was created correctly.

    // Get all event_ids from event_communities for this community (any status, primary link)
    const { data: ecLinks } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', communityId)
      .eq('is_primary', true)

    const ecEventIds = (ecLinks || []).map((l: { event_id: string }) => l.event_id)

    // Get all user_ids who are event_creator+ members of this community
    const { data: creatorMembers } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .in('role', ['event_creator', 'co_admin', 'admin'])

    const creatorUserIds = (creatorMembers || []).map((m: { user_id: string }) => m.user_id)

    if (ecEventIds.length === 0 && creatorUserIds.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // Build a union query: pending_approval events that are EITHER linked via
    // event_communities OR created by a member of this community
    // We query both sets and deduplicate by id.
    const queries: Promise<any>[] = []

    if (ecEventIds.length > 0) {
      queries.push(
        supabase
          .from('events')
          .select('id, title, date, created_by')
          .in('id', ecEventIds)
          .eq('status', 'pending_approval')
      )
    }

    if (creatorUserIds.length > 0) {
      queries.push(
        supabase
          .from('events')
          .select('id, title, date, created_by')
          .in('created_by', creatorUserIds)
          .eq('status', 'pending_approval')
      )
    }

    const results = await Promise.all(queries)
    const allEvents = results.flatMap((r) => r.data || [])

    // Deduplicate by event id
    const seen = new Set<string>()
    const uniqueEvents = allEvents.filter((ev: { id: string }) => {
      if (seen.has(ev.id)) return false
      seen.add(ev.id)
      return true
    })

    if (uniqueEvents.length === 0) {
      return NextResponse.json({ events: [] })
    }

    // Fetch creator profiles separately to avoid join failures
    const creatorIds = [...new Set(uniqueEvents.map((ev: { created_by: string | null }) => ev.created_by).filter(Boolean))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', creatorIds)

    const profileMap = new Map((profilesData || []).map((p: { id: string; full_name: string | null; email: string | null }) => [p.id, p]))

    const events = uniqueEvents.map((ev: { id: string; title: string; date: string; created_by: string | null }) => ({
      id: ev.id,
      title: ev.title,
      date: ev.date,
      created_by: ev.created_by,
      profiles: ev.created_by ? (profileMap.get(ev.created_by) || null) : null,
    }))

    return NextResponse.json({ events })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
