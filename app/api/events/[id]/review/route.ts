import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { ensureApprovedCommunityLinksForEvent } from '@/lib/server/ensureEventCommunityLinks'

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

    const { id: eventId } = await params
    const body = await request.json().catch(() => ({}))
    const { action, communityId, notes } = body

    if (!['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'action must be approved or rejected' }, { status: 400 })
    }
    if (!communityId) {
      return NextResponse.json({ error: 'communityId is required' }, { status: 400 })
    }

    // Check reviewer is community admin/co-admin or platform admin
    const { data: reviewerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const isPlatformAdmin = (reviewerProfile as { role?: string } | null)?.role === 'admin'

    if (!isPlatformAdmin) {
      const { data: membership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', authData.user.id)
        .single()

      if (!['admin', 'co_admin'].includes(membership?.role || '')) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    }

    // Fetch the event to get the creator
    const { data: event } = await supabase
      .from('events')
      .select('id, title, created_by, status')
      .eq('id', eventId)
      .single()

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const typedEvent = event as {
      id: string
      title: string
      created_by: string | null
      status: string
    }

    if (typedEvent.status !== 'pending_approval') {
      return NextResponse.json({ error: 'Event is not pending approval' }, { status: 400 })
    }

    if (action === 'approved') {
      // Set event to active
      await supabase
        .from('events')
        .update({ status: 'active' })
        .eq('id', eventId)

      // Upsert the event_communities link — update if exists, insert if not
      await supabase
        .from('event_communities')
        .upsert(
          {
            event_id: eventId,
            community_id: communityId,
            is_primary: true,
            status: 'approved',
            reviewed_by: authData.user.id,
            reviewed_at: new Date().toISOString(),
            submitted_at: new Date().toISOString(),
          },
          { onConflict: 'event_id,community_id' }
        )

      if (typedEvent.created_by) {
        try {
          await ensureApprovedCommunityLinksForEvent(supabase, eventId, typedEvent.created_by)
        } catch (healErr) {
          console.warn('ensureApprovedCommunityLinksForEvent after review:', healErr)
        }
      }

      // Notify the event creator
      if (typedEvent.created_by) {
        await supabase.rpc('create_notification', {
          p_user_id: typedEvent.created_by,
          p_type: 'event_approved',
          p_title: 'Event Approved! 🎉',
          p_message: `Your event "${typedEvent.title}" has been approved and is now live.`,
          p_related_booking_id: null,
          p_related_event_id: eventId,
        })
      }

      // Send new-event push to all users (now that it's live)
      try {
        const origin = request.nextUrl.origin
        const res = await fetch(`${origin}/api/events/notify-new`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ eventId }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          console.warn('notify-new after event review:', res.status, j)
        }
      } catch (err) {
        console.warn('notify-new fetch failed after event review:', err)
      }
    } else {
      // Rejected: keep as pending_approval with a note, notify creator
      if (typedEvent.created_by) {
        const notesText = notes ? ` Reason: ${notes}` : ''
        await supabase.rpc('create_notification', {
          p_user_id: typedEvent.created_by,
          p_type: 'event_rejected',
          p_title: 'Event Needs Changes',
          p_message: `Your event "${typedEvent.title}" was not approved yet.${notesText} Please update your submission.`,
          p_related_booking_id: null,
          p_related_event_id: eventId,
        })
      }

      // Mark the event as cancelled so it's visible to the creator but not others
      await supabase
        .from('events')
        .update({ status: 'cancelled' })
        .eq('id', eventId)
    }

    // Invalidate public caches so the events listing and detail pages reflect the change immediately
    revalidatePath('/events')
    revalidatePath('/events/[slug]', 'page')

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
