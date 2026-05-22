import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const CAL_API_KEY = process.env.CAL_COM_API_KEY

type CalRawBooking = {
  id: number
  title?: string
  startTime: string
  endTime: string
  status: string
  attendees?: { name?: string; email?: string }[]
  location?: string
  description?: string
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

async function fetchCalComBookings(from: Date, to: Date): Promise<BookingEntry[]> {
  if (!CAL_API_KEY) return []

  const results: BookingEntry[] = []

  // Fetch both upcoming and recently-past bookings in parallel.
  // Cal.com v1 doesn't support date-range filtering so we fetch a large
  // batch and filter on our side.
  const [upcomingRes, pastRes] = await Promise.all([
    fetch(`https://api.cal.com/v1/bookings?apiKey=${CAL_API_KEY}&status=upcoming&take=500`, {
      next: { revalidate: 120 },
    }),
    fetch(`https://api.cal.com/v1/bookings?apiKey=${CAL_API_KEY}&status=past&take=200`, {
      next: { revalidate: 120 },
    }),
  ])

  const [upcomingData, pastData] = await Promise.all([
    upcomingRes.ok ? upcomingRes.json() : { bookings: [] },
    pastRes.ok ? pastRes.json() : { bookings: [] },
  ])

  const raw: CalRawBooking[] = [
    ...((upcomingData.bookings as CalRawBooking[]) ?? []),
    ...((pastData.bookings as CalRawBooking[]) ?? []),
  ]

  const fromMs = from.getTime()
  const toMs = to.getTime()

  for (const b of raw) {
    const startMs = new Date(b.startTime).getTime()
    if (startMs < fromMs || startMs > toMs) continue
    // Skip cancelled bookings
    if (b.status === 'CANCELLED' || b.status === 'REJECTED') continue

    results.push({
      id: `cal_${b.id}`,
      title: b.title || 'Venue Reserved',
      startTime: b.startTime,
      endTime: b.endTime ?? null,
      status: b.status,
      source: 'calcom',
      attendeeName: b.attendees?.[0]?.name,
      attendeeEmail: b.attendees?.[0]?.email,
      location: b.location ?? undefined,
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

    // Fetch venue name to determine if Cal.com should be used
    const { data: venueRow } = await supabase
      .from('venues')
      .select('name')
      .eq('id', venueId)
      .single()

    const venueName: string = (venueRow as { name?: string } | null)?.name ?? ''

    // Cal.com is enabled for Ryan's Chai (or any venue matching CAL_COM_VENUE_NAME env var)
    const calVenueName = process.env.CAL_COM_VENUE_NAME ?? "Ryan's Chai"
    const isCalVenue = venueName.toLowerCase() === calVenueName.toLowerCase()

    // Fetch Cal.com bookings in parallel with the Supabase fetch (already done above)
    const calBookings: BookingEntry[] = isCalVenue
      ? await fetchCalComBookings(from, to)
      : []

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
      isCalVenue,
    })
  } catch (err: unknown) {
    console.error('[/api/cal/bookings]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
