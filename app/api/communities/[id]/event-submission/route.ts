import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * DELETE /api/communities/[id]/event-submission
 *
 * Withdraws (removes) an event's link to this community.
 * Allowed for: pending, expired, or rejected links.
 * The event owner or a community admin/co-admin can do this.
 * Approved primary links are blocked to prevent accidentally delisting an event.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: communityId } = await params
    const body = await request.json().catch(() => ({}))
    const { eventId } = body as { eventId?: string }

    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

    // Find the link
    const { data: link } = await supabase
      .from('event_communities')
      .select('id, status, is_primary')
      .eq('event_id', eventId)
      .eq('community_id', communityId)
      .maybeSingle()

    if (!link) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 })

    const { status, is_primary } = link as { id: string; status: string; is_primary: boolean }

    // Prevent withdrawing an approved primary link (it would break the event's community visibility)
    if (status === 'approved' && is_primary) {
      return NextResponse.json(
        { error: 'Cannot withdraw the primary approved community link. Use the event editor to change the primary community instead.' },
        { status: 400 },
      )
    }

    // Authorization: event owner or community admin/co-admin
    const [{ data: event }, { data: membership }] = await Promise.all([
      supabase.from('events').select('user_id').eq('id', eventId).single(),
      supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', authData.user.id)
        .maybeSingle(),
    ])

    const isEventOwner = (event as { user_id: string } | null)?.user_id === authData.user.id
    const isCommunityAdmin =
      !!membership &&
      ['admin', 'co_admin'].includes((membership as { role: string }).role)

    if (!isEventOwner && !isCommunityAdmin) {
      return NextResponse.json({ error: 'Not authorized to withdraw this invitation' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('event_communities')
      .delete()
      .eq('id', (link as { id: string }).id)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
