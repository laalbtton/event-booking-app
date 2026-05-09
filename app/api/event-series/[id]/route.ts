/**
 * PATCH /api/event-series/[id]
 *
 * Apply a scoped update to a recurring event series.
 *
 * Body:
 *   eventId          – the specific occurrence being edited
 *   occurrenceNumber – the occurrence's series_occurrence_number
 *   scope            – 'this' | 'this_and_following' | 'all'
 *   patch            – fields to update (title, description, venue_id, location, etc.)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { applySeriesUpdate, type UpdateScope } from '@/lib/server/eventSeries'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authHeader = req.headers.get('authorization')
  const { supabase, user } = await getUserFromAuthHeader(authHeader)

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!supabase) return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })

  const { id: seriesId } = await params

  // Verify the caller owns this series
  const { data: series } = await supabase
    .from('event_series')
    .select('id, host_user_id, created_by')
    .eq('id', seriesId)
    .single()

  if (!series) return NextResponse.json({ error: 'Series not found' }, { status: 404 })

  const isOwner = series.host_user_id === user.id || series.created_by === user.id
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isAdmin = profile?.role === 'admin'

  if (!isOwner && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { eventId, occurrenceNumber, scope, patch } = body as {
    eventId: string
    occurrenceNumber: number
    scope: UpdateScope
    patch: Record<string, unknown>
  }

  if (!eventId || occurrenceNumber == null || !scope || !patch) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await applySeriesUpdate(eventId, seriesId, occurrenceNumber, scope, patch)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('event-series PATCH error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
