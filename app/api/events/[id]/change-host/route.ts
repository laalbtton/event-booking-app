import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { userCanManageEvent } from '@/lib/server/eventPermissions'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * PATCH /api/events/[id]/change-host
 *
 * Body: { newHostUserId: string }
 *
 * Allowed by: event creator, platform admin, or community co_admin/admin for
 * any community the event is linked to.
 */
export async function PATCH(
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

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, created_by, host_user_id')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canManage = await userCanManageEvent(
      supabase,
      eventId,
      authData.user.id,
      { created_by: event.created_by, host_user_id: event.host_user_id }
    )

    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const newHostUserId = typeof body?.newHostUserId === 'string' ? body.newHostUserId.trim() : ''

    if (!newHostUserId) {
      return NextResponse.json({ error: 'newHostUserId is required' }, { status: 400 })
    }

    // Verify the new host exists as a user.
    const { data: newHostProfile, error: profileError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', newHostUserId)
      .maybeSingle()

    if (profileError || !newHostProfile) {
      return NextResponse.json({ error: 'New host user not found' }, { status: 404 })
    }

    // Record whether the old host already had a confirmed booking BEFORE the
    // host change.  We use this below to guard against any DB-level trigger
    // that might auto-insert a booking for the previous host when
    // host_user_id changes.
    const previousHostId = event.host_user_id
    let oldHostHadBookingBefore = false
    if (previousHostId && previousHostId !== newHostUserId) {
      const { count } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('user_id', previousHostId)
        .in('status', ['confirmed', 'waitlist'])
      oldHostHadBookingBefore = (count ?? 0) > 0
    }

    const { error: updateError } = await supabase
      .from('events')
      .update({
        host_user_id: newHostUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', eventId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // If the old host had no booking before the change, remove any booking
    // that might have been auto-created for them by a DB trigger so they
    // don't incorrectly appear in the attendees list.
    if (previousHostId && previousHostId !== newHostUserId && !oldHostHadBookingBefore) {
      const { data: phantomBookings } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', previousHostId)
        .in('status', ['confirmed', 'waitlist'])

      if (phantomBookings && phantomBookings.length > 0) {
        await supabase
          .from('bookings')
          .delete()
          .in('id', phantomBookings.map((b: { id: string }) => b.id))
      }
    }

    return NextResponse.json({
      success: true,
      newHostUserId,
      newHostName: newHostProfile.full_name,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('change-host error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
