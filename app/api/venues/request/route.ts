import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Must be event_creator or admin at platform level, OR event_creator in any community
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const profileRole = (profile as { role?: string } | null)?.role
    const isAllowedPlatformRole = profileRole === 'event_creator' || profileRole === 'admin'

    if (!isAllowedPlatformRole) {
      const { count } = await supabase
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', authData.user.id)
        .in('role', ['event_creator', 'co_admin', 'admin'])

      if (!count || count === 0) {
        return NextResponse.json({ error: 'Must be an event creator to request a venue' }, { status: 403 })
      }
    }

    const body = await request.json().catch(() => ({}))
    const { name, address, communityId } = body

    if (!name || !address) {
      return NextResponse.json({ error: 'name and address are required' }, { status: 400 })
    }

    const { data: venue, error: insertError } = await supabase
      .from('venues')
      .insert({
        name: name.trim(),
        address: address.trim(),
        status: 'pending',
        requested_by: authData.user.id,
        community_id: communityId || null,
        requested_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    // Notify community admins (if communityId provided) or platform admins
    if (communityId) {
      const { data: communityAdmins } = await supabase
        .from('community_members')
        .select('user_id')
        .eq('community_id', communityId)
        .in('role', ['admin', 'co_admin'])

      const { data: requester } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', authData.user.id)
        .single()

      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', communityId)
        .single()

      const requesterName = (requester as { full_name?: string } | null)?.full_name || 'A user'
      const communityName = (community as { name?: string } | null)?.name || 'your community'

      for (const admin of (communityAdmins || []) as { user_id: string }[]) {
        await supabase.rpc('create_notification', {
          p_user_id: admin.user_id,
          p_type: 'venue_pending_approval',
          p_title: 'New Venue Request',
          p_message: `${requesterName} has requested a new venue "${name}" for ${communityName}.`,
          p_related_booking_id: null,
          p_related_event_id: null,
        })
      }
    }

    return NextResponse.json({ success: true, venue })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
