import { Suspense } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventsFilters } from '@/components/public/PublicEventsFilters'
import { filterAndSortEvents } from '@/lib/server/filterPublicEvents'
import { isBramptonEvent } from '@/lib/server/bramptonEvents'
import { listPublicEvents } from '@/lib/server/publicContent'
import { BramptonEmailSubscribe } from './BramptonEmailSubscribe'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'This Week in Brampton — Open Mics & Variety Shows',
  description:
    'Always-current list of this week’s Brampton open mics and variety shows. Subscribe the calendar or get email updates.',
  openGraph: {
    title: 'This Week in Brampton',
    description: 'Open mics and variety shows happening this week in Brampton. Add to calendar or get email updates.',
    url: 'https://app.laalbutton.com/brampton',
    siteName: 'One Mic Stand',
    type: 'website',
  },
}

type SearchParams = {
  city?: string
  date?: string
  type?: string
  free?: string
}

export default async function BramptonThisWeekPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [params, upcomingRaw, pastRaw] = await Promise.all([
    searchParams,
    listPublicEvents(120, { upcomingOnly: true }),
    listPublicEvents(80, { pastOnly: true }),
  ])

  const city = params.city || 'Brampton'
  const datePreset = params.date || 'this_week'
  const eventType = params.type || ''
  const free = params.free || ''
  const cityIsBrampton = city.trim().toLowerCase() === 'brampton'

  const { upcoming } = filterAndSortEvents([...pastRaw, ...upcomingRaw], {
    city,
    datePreset,
    eventType,
    free,
    geoCity: null,
    sortMode: 'date',
    cityPredicate: cityIsBrampton ? isBramptonEvent : undefined,
  })

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-yellow-400">This week in Brampton</h1>
          <p className="mt-1 text-sm text-stone-400">
            Open mics and variety shows in Brampton.
          </p>
        </div>

        <Suspense fallback={null}>
          <PublicEventsFilters
            basePath="/brampton"
            defaultCity="Brampton"
            defaultDate="this_week"
          />
        </Suspense>

        {upcoming.length > 0 ? (
          <section>
            <h2 className="sr-only">Brampton events</h2>
            <div className="grid grid-cols-1 gap-4 md:gap-2">
              {upcoming.map((event) => (
                <PublicEventCard
                  key={event.id}
                  event={event}
                  cityFilter="Brampton"
                  compactOnDesktop
                />
              ))}
            </div>
          </section>
        ) : (
          <div className="rounded-xl border border-red-600/55 bg-zinc-800/40 py-16 text-center">
            <p className="text-lg font-medium text-stone-200">No upcoming events found</p>
            <p className="mt-2 text-sm text-stone-400">
              Try adjusting your filters, or check back soon for new Brampton shows.
            </p>
          </div>
        )}

        <section
          id="email-updates"
          className="scroll-mt-24 rounded-xl border border-white/10 bg-white/5 px-5 py-6 sm:px-6"
        >
          <h2 className="text-lg font-bold text-white">Email me the lineup</h2>
          <p className="mt-1 text-sm text-stone-400">
            This week’s Brampton open mics and variety shows, in your inbox. No account needed.
          </p>
          <div className="mt-4 max-w-lg">
            <BramptonEmailSubscribe />
          </div>
        </section>

        <p className="text-center text-sm text-stone-500">
          <Link href="/events" className="hover:text-stone-300">
            Browse all events
          </Link>
        </p>
      </main>
    </div>
  )
}
