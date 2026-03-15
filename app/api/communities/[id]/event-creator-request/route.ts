import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(
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

    // Must be a member of the community
    const { data: membership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', authData.user.id)
      .single()

    if (!membership) return NextResponse.json({ error: 'You must be a member to request event creator status' }, { status: 403 })
    if (['event_creator', 'co_admin', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'You already have event creator or higher privileges' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() || null : null

    const { error: insertError } = await supabase.from('community_event_creator_requests').insert({
      community_id: communityId,
      user_id: authData.user.id,
      message,
      status: 'pending',
    })

    if (insertError && insertError.code === '23505') {
      return NextResponse.json({ error: 'You already have a pending request for this community' }, { status: 400 })
    }
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    // Notify community admins and co-admins
    const { data: communityAdmins } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)
      .in('role', ['admin', 'co_admin'])

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authData.user.id)
      .single()

    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single()

    const applicantName = (profile as { full_name?: string } | null)?.full_name || authData.user.email || 'A user'
    const communityName = (community as { name?: string } | null)?.name || 'the community'

    for (const admin of (communityAdmins || []) as { user_id: string }[]) {
      await supabase.rpc('create_notification', {
        p_user_id: admin.user_id,
        p_type: 'community_event_creator_request',
        p_title: 'New Event Creator Request',
        p_message: `${applicantName} wants to become an event creator in ${communityName}.`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
