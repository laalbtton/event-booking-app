/**
 * POST /api/event-series
 *
 * Creates an event_series row and generates the initial horizon of occurrence events.
 * Called by the event creation form when the user enables "Make this recurring".
 */

import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { generateOccurrences } from '@/lib/server/eventSeries'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const { supabase, user } = await getUserFromAuthHeader(authHeader)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const body = await req.json()

  const {
    recurrence_type,
    day_of_week,
    week_of_month,
    start_time_local,
    duration_minutes,
    horizon_weeks = 12,
    title,
    description,
    venue_id,
    location,
    credits_required = 0,
    max_attendees,
    cancellation_hours = 24,
    event_type = 'open_mic',
    open_mic_type,
    rating,
    theme,
    // start_from: the first event's date (used to seed occurrence generation)
    start_from,
  } = body

  if (!recurrence_type || !start_time_local || !title || !start_from) {
    return NextResponse.json(
      { error: 'Missing required fields: recurrence_type, start_time_local, title, start_from' },
      { status: 400 }
    )
  }

  // Insert the series template
  const { data: series, error: seriesErr } = await supabase
    .from('event_series')
    .insert({
      recurrence_type,
      day_of_week: day_of_week ?? null,
      week_of_month: week_of_month ?? null,
      start_time_local,
      duration_minutes: duration_minutes ?? null,
      horizon_weeks,
      status: 'active',
      title,
      description: description ?? null,
      venue_id: venue_id ?? null,
      location: location ?? null,
      credits_required,
      max_attendees: max_attendees ?? null,
      cancellation_hours,
      host_user_id: user.id,
      created_by: user.id,
      event_type,
      open_mic_type: open_mic_type ?? null,
      rating: rating ?? null,
      theme: theme ?? null,
    })
    .select('id')
    .single()

  if (seriesErr || !series) {
    console.error('event-series POST: insert series error', seriesErr)
    return NextResponse.json({ error: 'Failed to create series' }, { status: 500 })
  }

  // Generate occurrences from one day before the first event date
  // so the first occurrence falls on or after start_from
  const seedDate = new Date(start_from)
  seedDate.setDate(seedDate.getDate() - 1)

  try {
    const eventIds = await generateOccurrences(series.id, seedDate, horizon_weeks + 2)
    return NextResponse.json({ seriesId: series.id, eventIds })
  } catch (err) {
    console.error('event-series POST: generateOccurrences error', err)
    // Clean up the orphaned series row
    await supabase.from('event_series').delete().eq('id', series.id)
    return NextResponse.json({ error: 'Failed to generate occurrences' }, { status: 500 })
  }
}
