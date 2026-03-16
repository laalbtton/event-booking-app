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

    const { id: venueId } = await params
    const body = await request.json().catch(() => ({}))
    const { action } = body

    if (!['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'action must be approved or rejected' }, { status: 400 })
    }

    // Fetch the venue
    const { data: venue } = await supabase
      .from('venues')
      .select('id, name, status, requested_by, community_id')
      .eq('id', venueId)
      .single()

    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

    const typedVenue = venue as {
      id: string
      name: string
      status: string
      requested_by: string | null
      community_id: string | null
    }

    // Check permissions: platform admin, or community admin for the venue's community
    const { data: reviewerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const isPlatformAdmin = (reviewerProfile as { role?: string } | null)?.role === 'admin'

    if (!isPlatformAdmin && typedVenue.community_id) {
      const { data: membership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', typedVenue.community_id)
        .eq('user_id', authData.user.id)
        .single()

      if (!['admin', 'co_admin'].includes(membership?.role || '')) {
        return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
      }
    } else if (!isPlatformAdmin) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Update venue status
    await supabase
      .from('venues')
      .update({ status: action })
      .eq('id', venueId)

    // Notify the requester
    if (typedVenue.requested_by) {
      const notifType = action === 'approved' ? 'venue_approved' : 'venue_rejected'
      const notifTitle = action === 'approved' ? 'Venue Approved' : 'Venue Request Rejected'
      const notifMessage = action === 'approved'
        ? `Your venue request "${typedVenue.name}" has been approved. You can now use it when creating events.`
        : `Your venue request "${typedVenue.name}" was not approved. Please contact your community admin for details.`

      await supabase.rpc('create_notification', {
        p_user_id: typedVenue.requested_by,
        p_type: notifType,
        p_title: notifTitle,
        p_message: notifMessage,
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
