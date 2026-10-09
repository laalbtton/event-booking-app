import { NextRequest, NextResponse } from 'next/server'
import { prepareRows, type AudienceRowInput, type ColumnMapping } from '@/lib/audienceImport'
import { requireAdmin } from '@/lib/server/adminAuth'
import { importAudienceRows } from '@/lib/server/audienceImport'
import { getWelcomeSegmentId } from '@/lib/server/resendAudience'

export const dynamic = 'force-dynamic'

/** Admin: recent past events (for the "which show was this sheet from?" picker) + import batches. */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase } = auth

  try {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    const until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const [{ data: events, error: eventsError }, { data: batches, error: batchesError }] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, date, location, venues(name)')
        .gte('date', since)
        .lte('date', until)
        .neq('status', 'cancelled')
        .order('date', { ascending: false })
        .limit(60),
      supabase
        .from('audience_signup_imports')
        .select(
          'id, event_id, consent_text, row_count, added_count, existing_count, invalid_count, matched_profile_count, welcome_sent_at, welcome_recipient_count, welcome_send_mode, welcome_broadcast_id, created_at, events(title, date)',
        )
        .order('created_at', { ascending: false })
        .limit(50),
    ])
    if (eventsError) throw eventsError
    // A missing table (migration not applied yet) should not hide the rest of the page.
    if (batchesError) console.error('[audience-import] could not load batches:', batchesError.message)

    return NextResponse.json({
      batchesError: batchesError ? `Could not load import history: ${batchesError.message}` : null,
      events: (events || []).map((e) => {
        const row = e as { id: string; title: string; date: string; location: string | null; venues: { name: string } | { name: string }[] | null }
        const v = Array.isArray(row.venues) ? row.venues[0] : row.venues
        return { id: row.id, title: row.title, date: row.date, venueName: v?.name || row.location || null }
      }),
      batches: (batches || []).map((b) => {
        const row = b as Record<string, unknown> & { events: { title: string; date: string } | { title: string; date: string }[] | null }
        const ev = Array.isArray(row.events) ? row.events[0] : row.events
        const { events: _ignored, ...rest } = row
        void _ignored
        return { ...rest, eventTitle: ev?.title || null, eventDate: ev?.date || null }
      }),
      welcomeSegmentConfigured: !!getWelcomeSegmentId(),
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

type ImportBody = {
  eventId?: string | null
  consentText?: string
  /** Raw parsed cells (after header removal) + the column mapping chosen in the UI. */
  rows?: string[][]
  mapping?: ColumnMapping
}

/** Admin: import one pasted / uploaded sign-up sheet. */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const { supabase, userId } = auth

  try {
    const body = (await request.json()) as ImportBody
    const consentText = (body.consentText || '').trim()
    if (!consentText) {
      return NextResponse.json({ error: 'Consent text is required (copy it from the sign-up sheet).' }, { status: 400 })
    }
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return NextResponse.json({ error: 'No rows to import.' }, { status: 400 })
    }
    if (body.rows.length > 2000) {
      return NextResponse.json({ error: 'Please import at most 2,000 rows at a time.' }, { status: 400 })
    }
    const mapping = body.mapping || {}
    if (!Object.values(mapping).includes('email')) {
      return NextResponse.json({ error: 'Pick which column holds the email address.' }, { status: 400 })
    }

    const prepared = prepareRows(body.rows, mapping)
    const okRows: AudienceRowInput[] = prepared
      .filter((r) => r.status === 'ok')
      .map(({ name, email, phone, languages }) => ({ name, email, phone, languages }))
    const invalidCount = prepared.filter((r) => r.status !== 'ok').length
    if (okRows.length === 0) {
      return NextResponse.json({ error: 'None of the rows had a usable email address.' }, { status: 400 })
    }

    let eventId: string | null = null
    let eventDate: string | null = null
    if (body.eventId) {
      const { data: ev } = await supabase.from('events').select('id, date').eq('id', body.eventId).maybeSingle()
      if (!ev) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })
      eventId = ev.id as string
      eventDate = ev.date as string
    }

    const result = await importAudienceRows(supabase, {
      rows: okRows,
      invalidCount,
      eventId,
      eventDate,
      consentText,
      createdBy: userId,
    })

    return NextResponse.json({ success: true, result })
  } catch (error: unknown) {
    console.error('[audience-import] POST failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
