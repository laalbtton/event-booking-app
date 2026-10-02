import { Suspense } from 'react'
import type { Metadata } from 'next'
import { listPublicEvents } from '@/lib/server/publicContent'
import { buildEventListMetadata } from '@/lib/seo/metadata'
import { getVisitorGeo } from '@/lib/server/geo'
import { filterAndSortEvents, parseSortMode } from '@/lib/server/filterPublicEvents'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { PublicEventsFilters } from '@/components/public/PublicEventsFilters'
import { PublicEventsSort } from '@/components/public/PublicEventsSort'
import { PublicEventsViewToggle } from '@/components/public/PublicEventsViewToggle'
import { PublicEventsCalendar } from '@/components/public/PublicEventsCalendar'

// Must be dynamic so we can read the visitor's IP for geo-sorting on every request
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildEventListMetadata()
}

type SearchParams = {
  city?: string
  date?: string
  type?: string
  free?: string
  sort?: string
  view?: string
}

export default async function PublicEventsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, upcomingRaw, pastRaw, geo] = await Promise.all([
    searchParams,
    listPublicEvents(120, { upcomingOnly: true }),
    listPublicEvents(120, { pastOnly: true }),
    getVisitorGeo(),
  ])

  const city = params.city || ''
  const datePreset = params.date || ''
  const eventType = params.type || ''
  const free = params.free || ''
  const sortMode = parseSortMode(params.sort)
  const view = params.view === 'calendar' ? 'calendar' : 'list'
  const allEvents = [...pastRaw, ...upcomingRaw]

  const { upcoming, past } = filterAndSortEvents(allEvents, {
    city,
    datePreset,
    eventType,
    free,
    geoCity: geo.city,
    sortMode,
    skipDatePreset: view === 'calendar',
  })

  const hasActiveFilters = !!(city || datePreset || eventType || free)
  const cityFilter = city || geo.city || null

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 space-y-6">
        {/* Page heading */}
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-yellow-400">
              {geo.city ? `Events near ${geo.city}` : 'Upcoming Events'}
            </h1>
            <Suspense fallback={null}>
              <PublicEventsViewToggle />
            </Suspense>
          </div>
          <p className="mt-1 text-sm text-stone-400">
            Discover comedy open mics, showcases, and live performances.
          </p>
        </div>

        {/* Sort + filters */}
        <Suspense fallback={null}>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            {view === 'list' && <PublicEventsSort />}
            <div className="min-w-0 flex-1">
              <PublicEventsFilters />
            </div>
          </div>
        </Suspense>

        {view === 'calendar' ? (
          <PublicEventsCalendar events={[...upcoming, ...past]} cityFilter={cityFilter} />
        ) : (
          <>
            {/* Upcoming events */}
            {upcoming.length > 0 ? (
              <section>
                <h2 className="sr-only">Upcoming Events</h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {upcoming.map((event) => (
                    <PublicEventCard key={event.id} event={event} cityFilter={cityFilter} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="rounded-xl border border-red-600/55 bg-zinc-800/40 py-16 text-center">
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
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {past.slice(0, 12).map((event) => (
                    <PublicEventCard key={event.id} event={event} cityFilter={null} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
