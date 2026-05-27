import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CAL_API_KEY = process.env.CAL_COM_API_KEY
const CAL_API_VERSION = '2026-05-01'

type CalV2Booking = {
  id: number
  uid: string
  title?: string
  start: string
  end: string
  status: string
  attendees?: { name?: string; email?: string }[]
  location?: string
  description?: string
}

type CalV2ListResponse = {
  status: string
  data?: CalV2Booking[]
  pagination?: { hasMore: boolean; nextCursor: string | null }
}

type BookingEntry = {
  id: string
  title: string
  startTime: string
  endTime: string | null
  status: string
  source: 'calcom' | 'app'
  attendeeName?: string
  attendeeEmail?: string
  location?: string
  description?: string
  eventSlug?: string
  eventType?: string
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function fetchCalComStatus(
  status: 'upcoming' | 'past',
  from: Date,
  to: Date,
): Promise<CalV2Booking[]> {
  const headers = {
    Authorization: `Bearer ${CAL_API_KEY}`,
    'cal-api-version': CAL_API_VERSION,
  }
  const collected: CalV2Booking[] = []
  let cursor: string | undefined

  do {
    const params = new URLSearchParams({
      status,
      limit: '100',
      afterStart: from.toISOString(),
    })
    if (cursor) params.set('cursor', cursor)

    const res = await fetch(`https://api.cal.com/v2/bookings?${params}`, {
      headers,
      next: { revalidate: 120 },
    })
    if (!res.ok) break

    const body = (await res.json()) as CalV2ListResponse
    if (body.status !== 'success' || !Array.isArray(body.data)) break

    collected.push(...body.data)
    cursor =
      body.pagination?.hasMore && body.pagination.nextCursor
        ? body.pagination.nextCursor
        : undefined
  } while (cursor)

  return collected
}

async function fetchCalComBookings(from: Date, to: Date): Promise<BookingEntry[]> {
  if (!CAL_API_KEY) return []

  const [upcoming, past] = await Promise.all([
    fetchCalComStatus('upcoming', from, to),
    fetchCalComStatus('past', from, to),
  ])

  const seen = new Set<number>()
  const results: BookingEntry[] = []
  const fromMs = from.getTime()
  const toMs = to.getTime()

  for (const b of [...upcoming, ...past]) {
    if (seen.has(b.id)) continue
    seen.add(b.id)

    const startMs = new Date(b.start).getTime()
    if (startMs < fromMs || startMs > toMs) continue
    if (b.status === 'cancelled' || b.status === 'rejected') continue

    results.push({
      id: `cal_${b.id}`,
      title: b.title || 'Venue Reserved',
      startTime: b.start,
      endTime: b.end ?? null,
      status: b.status,
      source: 'calcom',
      attendeeName: b.attendees?.[0]?.name,
      attendeeEmail: b.attendees?.[0]?.email,
      location: typeof b.location === 'string' ? b.location : undefined,
      description: b.description ?? undefined,
    })
  }

  return results
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId')
    if (!venueId) {
      return NextResponse.json({ error: 'venueId is required' }, { status: 400 })
    }

    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')
    const from = fromParam ? new Date(fromParam) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const to = toParam ? new Date(toParam) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)

    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    // Fetch app events for this venue from Supabase
    const { data: venueAndEvents } = await supabase
      .from('events')
      .select('id, slug, title, date, end_time, event_type, status')
      .eq('venue_id', venueId)
      .gte('date', from.toISOString())
      .lte('date', to.toISOString())
      .not('status', 'in', '("cancelled","archived")')
      .order('date', { ascending: true })

    // All Cal.com bookings belong to this venue — no name matching needed.
    // The frontend already gates the calendar to the correct venue page.
    const calBookings: BookingEntry[] = await fetchCalComBookings(from, to)

    const appEvents: BookingEntry[] = ((venueAndEvents ?? []) as Array<{
      id: string
      slug: string | null
      title: string
      date: string
      end_time: string | null
      event_type: string
      status: string
    }>).map((e) => ({
      id: `app_${e.id}`,
      title: e.title,
      startTime: e.date,
      // end_time may be a time-only string ("22:00:00") — combine with the
      // event date to get a full ISO timestamp.
      endTime: e.end_time
        ? e.end_time.includes('T')
          ? e.end_time
          : `${e.date.split('T')[0]}T${e.end_time}`
        : null,
      status: e.status ?? 'active',
      source: 'app',
      eventSlug: e.slug ?? e.id,
      eventType: e.event_type,
    }))

    return NextResponse.json({
      bookings: [...calBookings, ...appEvents],
      _debug: {
        calApiKeySet: !!CAL_API_KEY,
        calBookingsCount: calBookings.length,
        appEventsCount: appEvents.length,
      },
    })
  } catch (err: unknown) {
    console.error('[/api/cal/bookings]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
