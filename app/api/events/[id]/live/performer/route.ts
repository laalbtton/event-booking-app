/**
 * POST /api/events/[id]/live/performer
 *
 * Host/admin only. Sets (or clears) the single live performer for the event.
 * Body: { performerUserId: string | null }
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearer, loadEventAccess } from '@/lib/server/eventLiveMode'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: eventId } = await params
    const auth = await authenticateBearer(request)
    if (auth.error) return auth.error
    const { supabase, userId } = auth

    const access = await loadEventAccess(supabase, eventId, userId)
    if (access.error) return access.error
    const { isHost } = access

    if (!isHost) {
      return NextResponse.json({ error: 'Only the host can set the live performer' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const performerUserId =
      body.performerUserId === null || body.performerUserId === ''
        ? null
        : typeof body.performerUserId === 'string'
          ? body.performerUserId
          : null

    if (performerUserId) {
      const { data: performerBooking } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', performerUserId)
        .eq('status', 'confirmed')
        .neq('booking_scope', 'audience')
        .maybeSingle()

      if (!performerBooking) {
        return NextResponse.json({ error: 'Performer must have a confirmed booking' }, { status: 400 })
      }
    }

    const { error } = await supabase.from('event_live_state').upsert(
      {
        event_id: eventId,
        live_performer_user_id: performerUserId,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )

    if (error) {
      console.error('[live/performer]', error)
      return NextResponse.json({ error: 'Failed to update live performer' }, { status: 500 })
    }

    return NextResponse.json({ success: true, livePerformerUserId: performerUserId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[live/performer]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
