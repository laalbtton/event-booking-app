/**
 * Server-side helpers for recurring event series.
 *
 * generateOccurrences  — compute future dates for a series and insert event rows
 * extendAllActiveSeries — called by Inngest cron to push each active series
 *                         forward to its horizon_weeks limit
 */

import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { EASTERN_TZ } from '@/lib/dateUtils'
import { ensureApprovedCommunityLinksForEvent } from '@/lib/server/ensureEventCommunityLinks'
export { describeRecurrence } from '@/lib/eventSeriesUtils'

// ─── Types ───────────────────────────────────────────────────────────────────

export type EventSeriesRow = {
  id: string
  recurrence_type: 'weekly' | 'biweekly' | 'monthly_weekday'
  day_of_week: number | null
  week_of_month: number | null
  start_time_local: string   // 'HH:MM' or 'HH:MM:SS' Eastern wall-clock
  duration_minutes: number | null
  horizon_weeks: number
  status: 'active' | 'paused' | 'ended'
  title: string
  description: string | null
  venue_id: string | null
  location: string | null
  credits_required: number
  max_attendees: number | null
  cancellation_hours: number
  host_user_id: string | null
  created_by: string | null
  event_type: string
  open_mic_type: string | null
  rating: string | null
  theme: string | null
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/**
 * Convert a wall-clock date+time in Eastern to a UTC Date.
 * Works correctly across EST/EDT transitions.
 */
function easternWallClockToUTC(dateYmd: string, timeHms: string): Date {
  // Normalise time to HH:MM:SS
  const t = timeHms.length === 5 ? `${timeHms}:00` : timeHms

  // Guess: treat the local time naively as UTC
  const guess = new Date(`${dateYmd}T${t}Z`)

  // Find what Eastern clock reads at that UTC moment
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(guess)

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00'
  const hr = get('hour') === '24' ? '00' : get('hour') // formatToParts can emit 24 for midnight
  const easternAsUtc = new Date(
    `${get('year')}-${get('month')}-${get('day')}T${hr}:${get('minute')}:${get('second')}Z`
  )

  // Shift: actual UTC = guess + (guess − easternAsUtc)
  const offsetMs = guess.getTime() - easternAsUtc.getTime()
  return new Date(guess.getTime() + offsetMs)
}

/**
 * Get the Eastern calendar date (YYYY-MM-DD) for a given UTC Date.
 */
function toEasternYmd(utcDate: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(utcDate)
}

/**
 * Get the day-of-week (0=Sun … 6=Sat) in Eastern for a given UTC Date.
 */
function easternDayOfWeek(utcDate: Date): number {
  const dow = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
  }).format(utcDate)
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(dow)
}

/**
 * Add calendar days to a YYYY-MM-DD string (UTC date arithmetic; no DST drift).
 */
function addDaysToYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

// ─── Occurrence date computation ──────────────────────────────────────────────

/**
 * Given a series and a starting Eastern calendar date (inclusive),
 * return the next `count` occurrence dates (YYYY-MM-DD, Eastern).
 */
function computeNextOccurrenceDates(
  series: EventSeriesRow,
  afterYmd: string, // generate dates strictly AFTER this date
  count: number
): string[] {
  const dates: string[] = []

  if (series.recurrence_type === 'weekly' || series.recurrence_type === 'biweekly') {
    const step = series.recurrence_type === 'weekly' ? 7 : 14
    const targetDow = series.day_of_week ?? 0

    // Walk forward from afterYmd until we hit targetDow
    let cursor = addDaysToYmd(afterYmd, 1)
    let iterations = 0
    while (dates.length < count && iterations < 500) {
      iterations++
      const dow = easternDayOfWeek(easternWallClockToUTC(cursor, '12:00'))
      if (dow === targetDow) {
        dates.push(cursor)
        cursor = addDaysToYmd(cursor, step)
      } else {
        cursor = addDaysToYmd(cursor, 1)
      }
    }
  } else if (series.recurrence_type === 'monthly_weekday') {
    const targetDow = series.day_of_week ?? 0
    const weekOfMonth = series.week_of_month ?? 1

    // Start from the month after afterYmd (could also be same month if no occurrence yet)
    const [ay, am] = afterYmd.split('-').map(Number)
    let year = ay
    let month = am // 1-indexed

    let iterations = 0
    while (dates.length < count && iterations < 100) {
      iterations++
      const candidate = getNthWeekdayOfMonth(year, month, targetDow, weekOfMonth)
      if (candidate && candidate > afterYmd) {
        dates.push(candidate)
      }
      // Advance month
      month++
      if (month > 12) {
        month = 1
        year++
      }
    }
  }

  return dates
}

/**
 * Find the YYYY-MM-DD of the Nth weekday in a given month.
 * weekOfMonth: 1-4 (positive) or -1 (last occurrence).
 * Returns null if the month doesn't have that many occurrences (rare).
 */
function getNthWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: number, // 0=Sun … 6=Sat
  weekOfMonth: number
): string | null {
  if (weekOfMonth === -1) {
    // Last occurrence: start from last day of month, go backward
    const lastDay = new Date(Date.UTC(year, month, 0)) // day 0 of next month = last day of this month
    let d = lastDay.getUTCDate()
    while (d >= 1) {
      const dt = new Date(Date.UTC(year, month - 1, d))
      if (easternDayOfWeek(easternWallClockToUTC(dt.toISOString().slice(0, 10), '12:00')) === dayOfWeek) {
        return dt.toISOString().slice(0, 10)
      }
      d--
    }
    return null
  }

  // Positive nth: find first occurrence, then add (weekOfMonth-1)*7 days
  const firstDay = new Date(Date.UTC(year, month - 1, 1))
  const firstDow = easternDayOfWeek(easternWallClockToUTC(firstDay.toISOString().slice(0, 10), '12:00'))
  let delta = (dayOfWeek - firstDow + 7) % 7
  const firstOccurrenceDay = 1 + delta
  const nthDay = firstOccurrenceDay + (weekOfMonth - 1) * 7

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (nthDay > daysInMonth) return null

  const dt = new Date(Date.UTC(year, month - 1, nthDay))
  return dt.toISOString().slice(0, 10)
}

// ─── Core: generate occurrence event rows ─────────────────────────────────────

/**
 * Generate and insert the next `count` occurrence events for a series,
 * starting strictly after `afterDate`.
 *
 * Returns the IDs of newly inserted event rows.
 */
export async function generateOccurrences(
  seriesId: string,
  afterDate: Date,
  count: number
): Promise<string[]> {
  const db = getAdminClient()
  if (!db) throw new Error('Missing Supabase admin credentials')

  // Load series
  const { data: series, error: seriesErr } = await db
    .from('event_series')
    .select('*')
    .eq('id', seriesId)
    .single()

  if (seriesErr || !series) throw new Error(`Series not found: ${seriesId}`)

  // Find the highest existing occurrence number for this series
  const { data: lastOcc } = await db
    .from('events')
    .select('series_occurrence_number')
    .eq('series_id', seriesId)
    .order('series_occurrence_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  let nextOccNum = ((lastOcc?.series_occurrence_number as number | null) ?? 0) + 1

  // Compute occurrence dates
  const afterYmd = toEasternYmd(afterDate)
  const dates = computeNextOccurrenceDates(series as EventSeriesRow, afterYmd, count)

  if (dates.length === 0) return []

  // Build event rows
  const rows = dates.map((ymd, idx) => {
    const startUtc = easternWallClockToUTC(ymd, series.start_time_local)
    const endUtc = series.duration_minutes
      ? new Date(startUtc.getTime() + series.duration_minutes * 60_000)
      : null

    return {
      series_id: seriesId,
      series_occurrence_number: nextOccNum + idx,
      series_overridden: false,
      title: series.title,
      description: series.description,
      venue_id: series.venue_id,
      location: series.location,
      credits_required: series.credits_required,
      max_attendees: series.max_attendees,
      cancellation_hours: series.cancellation_hours,
      host_user_id: series.host_user_id,
      created_by: series.created_by,
      event_type: series.event_type,
      open_mic_type: series.open_mic_type,
      rating: series.rating,
      theme: series.theme,
      date: startUtc.toISOString(),
      end_time: endUtc?.toISOString() ?? null,
      tickets_enabled: false,
      external_event: false,
      external_ticket_url: null,
      status: 'active',
    }
  })

  const { data: inserted, error: insertErr } = await db
    .from('events')
    .insert(rows)
    .select('id')

  if (insertErr) throw new Error(`Failed to insert occurrences: ${insertErr.message}`)

  const ids = (inserted ?? []).map((r: { id: string }) => r.id)

  // Link each new occurrence to the creator's communities (same as the regular event create flow)
  if (series.created_by && ids.length > 0) {
    for (const id of ids) {
      try {
        await ensureApprovedCommunityLinksForEvent(db, id, series.created_by)
      } catch (err) {
        // Non-fatal — community linking failure should not block occurrence creation
        console.warn(`generateOccurrences: community link failed for event ${id}:`, err)
      }
    }
  }

  return ids
}

// ─── Core: extend all active series ──────────────────────────────────────────

/**
 * For every active series, find the latest existing occurrence and extend
 * forward to (now + horizon_weeks). Called by the weekly Inngest cron.
 *
 * Returns a summary: { seriesId, generated }[]
 */
export async function extendAllActiveSeries(): Promise<
  { seriesId: string; generated: number }[]
> {
  const db = getAdminClient()
  if (!db) throw new Error('Missing Supabase admin credentials')

  const { data: activeSeries, error } = await db
    .from('event_series')
    .select('id, horizon_weeks')
    .eq('status', 'active')

  if (error) throw new Error(`Failed to fetch active series: ${error.message}`)
  if (!activeSeries || activeSeries.length === 0) return []

  const results: { seriesId: string; generated: number }[] = []

  for (const s of activeSeries) {
    try {
      // Find the latest occurrence date
      const { data: latest } = await db
        .from('events')
        .select('date')
        .eq('series_id', s.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle()

      const latestDate = latest?.date ? new Date(latest.date) : new Date()

      // Horizon: now + horizon_weeks
      const horizonDate = new Date()
      horizonDate.setDate(horizonDate.getDate() + (s.horizon_weeks ?? 12) * 7)

      // Only generate if the latest occurrence is before the horizon
      if (latestDate >= horizonDate) {
        results.push({ seriesId: s.id, generated: 0 })
        continue
      }

      // Estimate how many occurrences to generate (generous upper bound)
      const weeksToFill = Math.ceil(
        (horizonDate.getTime() - latestDate.getTime()) / (7 * 24 * 3600 * 1000)
      )
      const countToGenerate = Math.min(weeksToFill + 2, 60) // safety cap

      const ids = await generateOccurrences(s.id, latestDate, countToGenerate)

      // Trim any that landed past the horizon (can happen with monthly recurrence)
      const overHorizonIds: string[] = []
      for (const id of ids) {
        const { data: ev } = await db
          .from('events')
          .select('date')
          .eq('id', id)
          .single()
        if (ev && new Date(ev.date) > horizonDate) {
          overHorizonIds.push(id)
        }
      }
      if (overHorizonIds.length > 0) {
        await db.from('events').delete().in('id', overHorizonIds)
      }

      results.push({ seriesId: s.id, generated: ids.length - overHorizonIds.length })
    } catch (err) {
      console.error(`extendAllActiveSeries: failed for series ${s.id}:`, err)
      results.push({ seriesId: s.id, generated: -1 })
    }
  }

  return results
}

// ─── Update scope helpers ─────────────────────────────────────────────────────

export type UpdateScope = 'this' | 'this_and_following' | 'all'

// Fields that are unique to each occurrence and must never be bulk-applied.
// Applying e.g. the same `slug` to multiple rows would hit a unique constraint.
const PER_OCCURRENCE_FIELDS = new Set([
  'slug',
  'date',
  'end_time',
  'registration_opens_at',
  'series_id',
  'series_occurrence_number',
  'series_overridden',
  'created_at',
  'created_by',
  'host_user_id',
])

// Fields that belong on the event_series template rather than individual events.
const SERIES_TEMPLATE_FIELDS = new Set([
  'title', 'description', 'venue_id', 'location',
  'credits_required', 'max_attendees', 'cancellation_hours',
  'rating', 'theme', 'duration_minutes', 'start_time_local',
])

/**
 * Apply a patch to occurrences of a series based on the chosen scope.
 *
 * - 'this'               → patch only the given event row, mark series_overridden=true
 * - 'this_and_following' → patch this + future non-overridden occurrences + series template
 * - 'all'                → patch series template + all non-overridden occurrences
 */
export async function applySeriesUpdate(
  eventId: string,
  seriesId: string,
  occurrenceNumber: number,
  scope: UpdateScope,
  patch: Record<string, unknown>
): Promise<void> {
  const db = getAdminClient()
  if (!db) throw new Error('Missing Supabase admin credentials')

  if (scope === 'this') {
    // For a single-event update, apply the full patch (slug etc. are fine for one event)
    await db
      .from('events')
      .update({ ...patch, series_overridden: true, updated_at: new Date().toISOString() })
      .eq('id', eventId)
    return
  }

  // Build the series template patch (template fields only)
  const seriesPatch: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    if (SERIES_TEMPLATE_FIELDS.has(key)) seriesPatch[key] = patch[key]
  }

  // Build the bulk event patch — strip per-occurrence fields and series-only fields
  const bulkEventPatch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of Object.keys(patch)) {
    if (!PER_OCCURRENCE_FIELDS.has(key) && !SERIES_TEMPLATE_FIELDS.has(key)) {
      bulkEventPatch[key] = patch[key]
    } else if (SERIES_TEMPLATE_FIELDS.has(key) && !PER_OCCURRENCE_FIELDS.has(key)) {
      // Template fields are safe to copy to individual event rows too (title, description, etc.)
      bulkEventPatch[key] = patch[key]
    }
  }
  // Remove the series-specific keys that don't exist on events rows
  delete bulkEventPatch.duration_minutes
  delete bulkEventPatch.start_time_local

  if (scope === 'all') {
    if (Object.keys(seriesPatch).length > 0) {
      await db.from('event_series').update({ ...seriesPatch, updated_at: new Date().toISOString() }).eq('id', seriesId)
    }
    if (Object.keys(bulkEventPatch).length > 1) { // > 1 because updated_at is always present
      await db
        .from('events')
        .update(bulkEventPatch)
        .eq('series_id', seriesId)
        .eq('series_overridden', false)
    }
    return
  }

  // 'this_and_following'
  if (Object.keys(seriesPatch).length > 0) {
    await db.from('event_series').update({ ...seriesPatch, updated_at: new Date().toISOString() }).eq('id', seriesId)
  }
  if (Object.keys(bulkEventPatch).length > 1) {
    await db
      .from('events')
      .update(bulkEventPatch)
      .eq('series_id', seriesId)
      .eq('series_overridden', false)
      .gte('series_occurrence_number', occurrenceNumber)
  }
}

