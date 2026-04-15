import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { communityAutoApprovesNewEvents } from '@/lib/communityAutoApprove'

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
    const body = await request.json().catch(() => ({}))
    const { eventId, isPrimary } = body

    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

    const { data: communityRow } = await supabase
      .from('communities')
      .select('id, auto_approve_new_events')
      .eq('id', communityId)
      .maybeSingle()

    if (!communityRow) return NextResponse.json({ error: 'Community not found' }, { status: 404 })

    const autoApprove = communityAutoApprovesNewEvents(
      (communityRow as { auto_approve_new_events?: boolean }).auto_approve_new_events
    )

    // Must be event_creator, co_admin, or admin in this community
    const { data: membership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', authData.user.id)
      .single()

    if (!membership || !['event_creator', 'co_admin', 'admin'].includes((membership as { role: string }).role)) {
      return NextResponse.json({ error: 'You must be an event creator in this community' }, { status: 403 })
    }

    // Check max 3 community limit for this event
    const { data: existingLinks } = await supabase
      .from('event_communities')
      .select('id, status')
      .eq('event_id', eventId)
      .in('status', ['approved', 'pending'])

    if (existingLinks && existingLinks.length >= 3) {
      return NextResponse.json({ error: 'Events can belong to at most 3 communities' }, { status: 400 })
    }

    const now = new Date()
    const isPrimaryBool = Boolean(isPrimary)
    // Non-primary cross-submissions expire after 7 days if not reviewed
    const expiresAt = isPrimaryBool ? null : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

    // Primary + auto-approve: link is approved immediately so the event appears on Perform once active.
    // Primary + manual review: pending until a community admin approves (Pending links / New Events).
    // Non-primary: always pending + expiry (submitted later from the event communities dialog).
    const linkApproved = isPrimaryBool && autoApprove
    const status: 'approved' | 'pending' = linkApproved ? 'approved' : 'pending'
    const reviewedAt = linkApproved ? now.toISOString() : null
    const reviewedBy = linkApproved ? authData.user.id : null

    const linkPayload = {
      event_id: eventId,
      community_id: communityId,
      is_primary: isPrimaryBool,
      status,
      submitted_by: authData.user.id,
      submitted_at: now.toISOString(),
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      expires_at: expiresAt,
    }

    const { error: insertError } = await supabase.from('event_communities').insert(linkPayload)

    if (insertError && insertError.code === '23505') {
      // Duplicate row: only allow re-submission if the existing link is expired or rejected
      const { data: existingLink } = await supabase
        .from('event_communities')
        .select('id, status')
        .eq('event_id', eventId)
        .eq('community_id', communityId)
        .single()

      const existingStatus = (existingLink as { id: string; status: string } | null)?.status

      if (existingStatus === 'expired' || existingStatus === 'rejected') {
        // Revive the row: reset to pending with a fresh expiry window
        const { error: updateError } = await supabase
          .from('event_communities')
          .update({
            status,
            is_primary: isPrimaryBool,
            submitted_by: authData.user.id,
            submitted_at: now.toISOString(),
            reviewed_by: reviewedBy,
            reviewed_at: reviewedAt,
            expires_at: expiresAt,
          })
          .eq('id', (existingLink as { id: string }).id)

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })
      } else {
        return NextResponse.json(
          { error: 'This event is already associated with this community' },
          { status: 400 },
        )
      }
    } else if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 400 })
    }

    // Notify community admins of cross-community submission (non-primary only; primary pending
    // is paired with the event-level notification from the manage page).
    if (!isPrimaryBool) {
      const { data: communityAdmins } = await supabase
        .from('community_members')
        .select('user_id')
        .eq('community_id', communityId)
        .in('role', ['admin', 'co_admin'])

      const { data: event } = await supabase
        .from('events')
        .select('title')
        .eq('id', eventId)
        .single()

      const { data: community } = await supabase
        .from('communities')
        .select('name')
        .eq('id', communityId)
        .single()

      for (const admin of (communityAdmins || []) as { user_id: string }[]) {
        await supabase.rpc('create_notification', {
          p_user_id: admin.user_id,
          p_type: 'cross_community_submission',
          p_title: 'Cross-Community Event Submission',
          p_message: `An event "${(event as { title?: string } | null)?.title || 'Untitled'}" has been submitted to ${(community as { name?: string } | null)?.name || 'your community'} for review.`,
          p_related_booking_id: null,
          p_related_event_id: eventId,
        })
      }
    }

    return NextResponse.json({
      success: true,
      linkStatus: status,
      autoApproveNewEvents: autoApprove,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
