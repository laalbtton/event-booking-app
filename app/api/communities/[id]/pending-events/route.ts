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

    // Fetch all event_communities links for this community (no status filter —
    // primary events land as 'approved' in event_communities but 'pending_approval' in events)
    const { data: links, error: linksError } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', communityId)

    if (linksError) return NextResponse.json({ error: linksError.message }, { status: 500 })

    const eventIds = (links || []).map((l: { event_id: string }) => l.event_id)
    if (eventIds.length === 0) return NextResponse.json({ events: [] })

    // Fetch events in pending_approval status — service role bypasses RLS
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, created_by, profiles(full_name, email)')
      .in('id', eventIds)
      .eq('status', 'pending_approval')

    if (eventsError) return NextResponse.json({ error: eventsError.message }, { status: 500 })

    return NextResponse.json({ events: events || [] })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
