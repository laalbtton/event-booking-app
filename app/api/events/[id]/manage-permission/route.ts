import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveEventManageAccess } from '@/lib/server/eventPermissions'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * GET /api/events/[id]/manage-permission
 *
 * Returns whether the authenticated user may manage the given event, along
 * with the pre-loaded data the manage page needs (host name, community
 * member list for the host picker).
 *
 * Uses the service-role key so there are no RLS blind-spots on
 * event_communities or community_members.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 })
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

    const { id: eventId } = await params
    const userId = authData.user.id

    // Fetch event ownership fields.
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, created_by, host_user_id')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { canManage, communityIds } = await resolveEventManageAccess(supabase, eventId, userId)

    if (!canManage) {
      return NextResponse.json({ canManage: false })
    }

    // Fetch current host name.
    const hostId = (event.host_user_id ?? event.created_by) as string | null
    let hostName: string | null = null
    if (hostId) {
      const { data: hostProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', hostId)
        .maybeSingle()
      hostName = hostProfile?.full_name ?? null
    }

    // Fetch community members for the host picker.
    let communityMembers: { id: string; full_name: string | null }[] = []
    if (communityIds.length > 0) {
      const { data: members } = await supabase
        .from('community_members')
        .select('user_id, profiles(id, full_name)')
        .in('community_id', communityIds)

      const unique = new Map<string, { id: string; full_name: string | null }>()
      for (const m of members ?? []) {
        const p = (m as any).profiles as { id: string; full_name: string | null } | null
        if (p && !unique.has(p.id)) unique.set(p.id, p)
      }
      communityMembers = [...unique.values()].sort((a, b) =>
        (a.full_name ?? '').localeCompare(b.full_name ?? '')
      )
    }

    return NextResponse.json({ canManage: true, hostName, communityMembers })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('manage-permission error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
