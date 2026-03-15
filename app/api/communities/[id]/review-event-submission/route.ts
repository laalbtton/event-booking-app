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

    // Must be community admin/co-admin or super admin
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
    const { eventCommunityId, action } = body

    if (!eventCommunityId || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'eventCommunityId and action (approved|rejected) are required' }, { status: 400 })
    }

    // Verify the submission belongs to this community and is pending
    const { data: submission } = await supabase
      .from('event_communities')
      .select('status, submitted_by, event_id, expires_at')
      .eq('id', eventCommunityId)
      .eq('community_id', communityId)
      .single()

    if (!submission) return NextResponse.json({ error: 'Submission not found' }, { status: 404 })

    const sub = submission as { status: string; submitted_by: string; event_id: string; expires_at: string | null }

    if (sub.status !== 'pending') {
      return NextResponse.json({ error: 'This submission has already been reviewed' }, { status: 400 })
    }

    // Check if expired
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) {
      await supabase
        .from('event_communities')
        .update({ status: 'expired' })
        .eq('id', eventCommunityId)
      return NextResponse.json({ error: 'This submission has expired' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('event_communities')
      .update({
        status: action,
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', eventCommunityId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    // Notify the submitter
    const { data: community } = await supabase
      .from('communities')
      .select('name')
      .eq('id', communityId)
      .single()

    const { data: event } = await supabase
      .from('events')
      .select('title')
      .eq('id', sub.event_id)
      .single()

    if (sub.submitted_by) {
      await supabase.rpc('create_notification', {
        p_user_id: sub.submitted_by,
        p_type: 'cross_community_submission',
        p_title: action === 'approved' ? 'Event Submission Approved' : 'Event Submission Update',
        p_message: action === 'approved'
          ? `Your event "${(event as { title?: string } | null)?.title || 'Untitled'}" has been approved in ${(community as { name?: string } | null)?.name || 'the community'}.`
          : `Your event submission to ${(community as { name?: string } | null)?.name || 'the community'} was not approved.`,
        p_related_booking_id: null,
        p_related_event_id: sub.event_id,
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
