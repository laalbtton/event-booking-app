/**
 * POST /api/events/[id]/live/vote
 *
 * Confirmed attendee. Cast or update a green/red vote for a performer.
 * Body: { performerUserId: string, vote: 'green' | 'red' }
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
    const { hasConfirmedBooking } = access

    if (!hasConfirmedBooking) {
      return NextResponse.json({ error: 'Confirmed booking required to vote' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const performerUserId = typeof body.performerUserId === 'string' ? body.performerUserId : null
    const vote = body.vote === 'green' || body.vote === 'red' ? body.vote : null

    if (!performerUserId || !vote) {
      return NextResponse.json({ error: 'performerUserId and vote (green|red) are required' }, { status: 400 })
    }

    if (performerUserId === userId) {
      return NextResponse.json({ error: 'You cannot vote for yourself' }, { status: 400 })
    }

    const { data: performerBooking } = await supabase
      .from('bookings')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', performerUserId)
      .eq('status', 'confirmed')
      .neq('booking_scope', 'audience')
      .maybeSingle()

    if (!performerBooking) {
      return NextResponse.json({ error: 'Performer not found on this event' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('event_performer_votes').upsert(
      {
        event_id: eventId,
        voter_user_id: userId,
        performer_user_id: performerUserId,
        vote,
        updated_at: now,
      },
      { onConflict: 'event_id,voter_user_id,performer_user_id' },
    )

    if (error) {
      console.error('[live/vote]', error)
      return NextResponse.json({ error: 'Failed to save vote' }, { status: 500 })
    }

    return NextResponse.json({ success: true, performerUserId, vote })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[live/vote]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
