import { Suspense } from 'react'
import type { Metadata } from 'next'
import { listPublicEvents } from '@/lib/server/publicContent'
import type { PublicEventDetails } from '@/lib/server/publicContent'
import { buildEventListMetadata } from '@/lib/seo/metadata'
import { getVisitorGeo } from '@/lib/server/geo'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { PublicEventsFilters } from '@/components/public/PublicEventsFilters'
import { PublicEventsSort } from '@/components/public/PublicEventsSort'

// Must be dynamic so we can read the visitor's IP for geo-sorting on every request
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildEventListMetadata()
}

function getDateBounds(preset: string): { from: Date; to: Date } | null {
  const now = new Date()
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
    return { from: start, to: end }
  }
  if (preset === 'this_week') {
    const start = new Date(now)
    const end = new Date(now)
    end.setDate(now.getDate() + (6 - now.getDay() + 1))
    return { from: start, to: end }
  }
  if (preset === 'this_month') {
    const start = new Date(now)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
    return { from: start, to: end }
  }
  return null
}

function venueSortKey(e: PublicEventDetails): string {
  return (e.venue?.name || e.locationText || '').toLowerCase()
}

function filterAndSortEvents(
  events: PublicEventDetails[],
  {
    city,
    datePreset,
    eventType,
    free,
    geoCity,
    sortMode,
  }: {
    city: string
    datePreset: string
    eventType: string
    free: string
    geoCity: string | null
    sortMode: 'date' | 'near' | 'venue'
  }
): { upcoming: PublicEventDetails[]; past: PublicEventDetails[] } {
  const now = new Date()

  let filtered = events.filter(
    (e) => !['cancelled', 'archived', 'draft', 'private'].includes((e.status || '').toLowerCase())
  )

  // City filter
  const cityQuery = city.trim().toLowerCase()
  if (cityQuery) {
    filtered = filtered.filter((e) => {
      const eventCity = (e.venue?.city || e.locationText || '').toLowerCase()
      return eventCity.includes(cityQuery)
    })
  }

  // Date preset filter
  const dateBounds = getDateBounds(datePreset)
  if (dateBounds) {
    filtered = filtered.filter((e) => {
      const d = new Date(e.startDate)
      return d >= dateBounds.from && d <= dateBounds.to
    })
  }

  // Event type filter
  if (eventType) {
    filtered = filtered.filter((e) => {
      if (eventType === 'booked_show') return e.eventType === 'booked_show'
      if (eventType === 'comedy_open_mic') return e.eventType === 'open_mic' && e.openMicType === 'comedy_open_mic'
      if (eventType === 'variety_arts_open_mic') return e.eventType === 'open_mic' && e.openMicType === 'variety_arts_open_mic'
      return true
    })
  }

  // Free / paid filter
  if (free === 'free') filtered = filtered.filter((e) => e.isFree)
  if (free === 'paid') filtered = filtered.filter((e) => !e.isFree)

  const upcoming = filtered.filter((e) => new Date(e.startDate) >= now)
  const past = filtered.filter((e) => new Date(e.startDate) < now)

  if (sortMode === 'venue') {
    upcoming.sort((a, b) => {
      const va = venueSortKey(a)
      const vb = venueSortKey(b)
      if (va !== vb) return va.localeCompare(vb)
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
    past.sort((a, b) => {
      const va = venueSortKey(a)
      const vb = venueSortKey(b)
      if (va !== vb) return va.localeCompare(vb)
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })
  } else if (sortMode === 'near' && geoCity && !cityQuery) {
    const geoCityLower = geoCity.toLowerCase()
    upcoming.sort((a, b) => {
      const aCity = (a.venue?.city || a.locationText || '').toLowerCase()
      const bCity = (b.venue?.city || b.locationText || '').toLowerCase()
      const aMatch = aCity.includes(geoCityLower) ? 0 : 1
      const bMatch = bCity.includes(geoCityLower) ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
    past.sort((a, b) => {
      const aCity = (a.venue?.city || a.locationText || '').toLowerCase()
      const bCity = (b.venue?.city || b.locationText || '').toLowerCase()
      const aMatch = aCity.includes(geoCityLower) ? 0 : 1
      const bMatch = bCity.includes(geoCityLower) ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })
  } else {
    upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    past.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }

  return { upcoming, past }
}

type SearchParams = { city?: string; date?: string; type?: string; free?: string; sort?: string }

function parseSortMode(raw: string | undefined): 'date' | 'near' | 'venue' {
  if (raw === 'near' || raw === 'venue') return raw
  return 'date'
}

export default async function PublicEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, allEvents, geo] = await Promise.all([
    searchParams,
    listPublicEvents(100),
    getVisitorGeo(),
  ])

  const city = params.city || ''
  const datePreset = params.date || ''
  const eventType = params.type || ''
  const free = params.free || ''
  const sortMode = parseSortMode(params.sort)

  const { upcoming, past } = filterAndSortEvents(allEvents, {
    city,
    datePreset,
    eventType,
    free,
    geoCity: geo.city,
    sortMode,
  })

  const hasActiveFilters = !!(city || datePreset || eventType || free)
  const cityFilter = city || geo.city || null

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 space-y-6">
        {/* Page heading */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-yellow-400">
            {geo.city ? `Events near ${geo.city}` : 'Upcoming Events'}
          </h1>
          <p className="mt-1 text-sm text-stone-400">
            Discover comedy open mics, showcases, and live performances.
          </p>
        </div>

        {/* Sort + filters */}
        <Suspense fallback={null}>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <PublicEventsSort />
            <div className="min-w-0 flex-1">
              <PublicEventsFilters />
            </div>
          </div>
        </Suspense>

        {/* Upcoming events */}
        {upcoming.length > 0 ? (
          <section>
            <h2 className="sr-only">Upcoming Events</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {upcoming.map((event) => (
                <PublicEventCard key={event.id} event={event} cityFilter={cityFilter} />
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 py-16 text-center">
            <p className="text-lg font-medium text-stone-200">No upcoming events found</p>
            <p className="mt-2 text-sm text-stone-400">
              {hasActiveFilters
                ? 'Try adjusting your filters or clear them to see all events.'
                : 'Check back soon — new events are added regularly.'}
            </p>
            {hasActiveFilters && (
              <a
                href="/events"
                className="mt-4 inline-block text-sm font-medium text-yellow-400 underline hover:text-yellow-300"
              >
                Clear all filters
              </a>
            )}
          </div>
        )}

        {/* Past events (shown only when no active filters) */}
        {!hasActiveFilters && past.length > 0 && (
          <section>
            <h2 className="text-base font-semibold text-stone-500 mb-3">Past Events</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {past.slice(0, 12).map((event) => (
                <PublicEventCard key={event.id} event={event} cityFilter={null} />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
