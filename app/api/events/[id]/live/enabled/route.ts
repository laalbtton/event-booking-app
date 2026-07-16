/**
 * POST /api/events/[id]/live/enabled
 *
 * Host/admin only. Turns Live Mode visibility on/off for attendees.
 * Body: { enabled: boolean }
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
    if (!access.isHost) {
      return NextResponse.json({ error: 'Only the host can enable Live Mode' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const enabled = body.enabled === true

    const { data: existing } = await supabase
      .from('event_live_state')
      .select('live_performer_user_id')
      .eq('event_id', eventId)
      .maybeSingle()

    const { error } = await supabase.from('event_live_state').upsert(
      {
        event_id: eventId,
        enabled,
        live_performer_user_id: existing?.live_performer_user_id ?? null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'event_id' },
    )

    if (error) {
      console.error('[live/enabled]', error)
      return NextResponse.json({ error: 'Failed to update Live Mode' }, { status: 500 })
    }

    return NextResponse.json({ success: true, enabled })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[live/enabled]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
