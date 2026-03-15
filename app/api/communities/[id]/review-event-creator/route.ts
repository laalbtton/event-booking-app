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

    // Must be community admin or co-admin (or super admin)
    const { data: reviewerMembership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', authData.user.id)
      .single()

    const { data: reviewerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const isSuperAdmin = (reviewerProfile as { role?: string } | null)?.role === 'admin'
    const isCommunityAdmin = ['admin', 'co_admin'].includes(reviewerMembership?.role || '')

    if (!isSuperAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { requestId, action, adminNotes } = body

    if (!requestId || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'requestId and action (approved|rejected) are required' }, { status: 400 })
    }

    const { data: ecRequest } = await supabase
      .from('community_event_creator_requests')
      .select('user_id, status')
      .eq('id', requestId)
      .eq('community_id', communityId)
      .single()

    if (!ecRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if ((ecRequest as { status: string }).status !== 'pending') {
      return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('community_event_creator_requests')
      .update({
        status: action,
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
      })
      .eq('id', requestId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    if (action === 'approved') {
      await supabase
        .from('community_members')
        .update({ role: 'event_creator' })
        .eq('community_id', communityId)
        .eq('user_id', (ecRequest as { user_id: string }).user_id)

      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', communityId)
        .single()

      await supabase.rpc('create_notification', {
        p_user_id: (ecRequest as { user_id: string }).user_id,
        p_type: 'community_event_creator_request',
        p_title: 'Event Creator Request Approved',
        p_message: `Your request to become an event creator in ${(community as { name?: string } | null)?.name || 'the community'} has been approved!`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    } else {
      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', communityId)
        .single()

      await supabase.rpc('create_notification', {
        p_user_id: (ecRequest as { user_id: string }).user_id,
        p_type: 'community_event_creator_request',
        p_title: 'Event Creator Request Update',
        p_message: `Your request to become an event creator in ${(community as { name?: string } | null)?.name || 'the community'} was not approved at this time.`,
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
