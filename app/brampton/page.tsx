import type { Metadata } from 'next'
import Link from 'next/link'
import { BramptonMicStoolLogo } from '@/components/public/BramptonMicStoolLogo'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { PublicHeader } from '@/components/public/PublicHeader'
import { bramptonCalendarSubscribeUrls, getBramptonWeekEvents } from '@/lib/server/bramptonEvents'
import { formatEventWeekdayDateEastern, getEasternCalendarDateString } from '@/lib/dateUtils'
import type { PublicEventDetails } from '@/lib/server/publicContent'
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

function groupByEasternDay(events: PublicEventDetails[]) {
  const groups: Array<{ ymd: string; label: string; events: PublicEventDetails[] }> = []
  const index = new Map<string, number>()

  for (const event of events) {
    const ymd = getEasternCalendarDateString(event.startDate)
    const existing = index.get(ymd)
    if (existing != null) {
      groups[existing].events.push(event)
      continue
    }
    index.set(ymd, groups.length)
    groups.push({ ymd, label: formatEventWeekdayDateEastern(event.startDate), events: [event] })
  }

  return groups
}

function EventGroup({ title, events }: { title: string; events: PublicEventDetails[] }) {
  if (events.length === 0) return null
  const groups = groupByEasternDay(events)

  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-bold text-white">{title}</h2>
      {groups.map((group) => (
        <div key={group.ymd}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-yellow-400">
            {group.label}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {group.events.map((event) => (
              <PublicEventCard key={event.id} event={event} cityFilter="Brampton" />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}

export default async function BramptonThisWeekPage() {
  const { thisWeek, comingUp, weekLabel } = await getBramptonWeekEvents()
  const { webcal, google, icsPath } = bramptonCalendarSubscribeUrls()

  return (
    <div className="min-h-screen bg-zinc-950 text-stone-100">
      <PublicHeader />

      <div className="border-b border-yellow-400/30 bg-zinc-900 px-4 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="text-sm text-stone-300">Get this week’s shows by email.</p>
          <a
            href="#email-updates"
            className="shrink-0 rounded-lg bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-yellow-300"
          >
            Email signup
          </a>
        </div>
      </div>

      <section className="relative overflow-hidden bg-gradient-to-br from-black via-neutral-950 to-stone-900 px-4 pt-8 pb-12 sm:pt-12 sm:pb-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.10),transparent_55%)]" />
        <div className="relative mx-auto max-w-3xl text-center">
          <BramptonMicStoolLogo size="md" className="mb-4" />
          <span className="inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-yellow-300">
            Always current
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl">
            This week in <span className="text-yellow-400">Brampton</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-stone-300 sm:text-lg">
            Open mics and variety shows for {weekLabel}. One page, one QR, always this week.
          </p>
          <p className="mt-3 text-sm text-stone-500">app.laalbutton.com/brampton</p>

          <div className="mt-8 flex flex-col sm:flex-row flex-wrap justify-center gap-3">
            <a
              href="#email-updates"
              className="rounded-xl bg-yellow-400 px-6 py-3 text-sm font-bold text-zinc-950 hover:bg-yellow-300"
            >
              Email me the lineup
            </a>
            <a
              href={webcal}
              className="rounded-xl border border-yellow-400/60 px-6 py-3 text-sm font-bold text-yellow-400 hover:bg-yellow-400 hover:text-zinc-950"
            >
              Subscribe in Calendar
            </a>
            <a
              href={google}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-stone-200 hover:border-white/40"
            >
              Add to Google Calendar
            </a>
            <a
              href={icsPath}
              className="rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-stone-200 hover:border-white/40"
            >
              Download ICS
            </a>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 space-y-12">
        {thisWeek.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-8 text-center">
            <p className="text-lg font-semibold text-white">No Brampton shows listed for this week yet.</p>
            <p className="mt-2 text-sm text-stone-400">
              Subscribe below and we’ll email you when the next open mic or variety show goes up.
            </p>
          </div>
        ) : (
          <EventGroup title="This week" events={thisWeek} />
        )}

        <EventGroup title="Coming up" events={comingUp} />

        <section
          id="email-updates"
          className="scroll-mt-32 rounded-2xl border border-white/10 bg-white/5 px-5 py-7 sm:px-7"
        >
          <h2 className="text-center text-2xl font-bold text-white">Email me the lineup</h2>
          <p className="mx-auto mt-2 max-w-md text-center text-sm text-stone-400">
            Get this week’s Brampton open mics and variety shows in your inbox. No account needed.
          </p>
          <div className="mx-auto mt-6 max-w-lg">
            <BramptonEmailSubscribe />
          </div>
        </section>

        <section className="text-center pb-8">
          <p className="text-sm text-stone-400">
            Want a free ticket and founding-member perks?{' '}
            <Link href="/brampton-comedy-insider" className="font-semibold text-yellow-400 hover:text-yellow-300">
              Join Brampton Comedy Insider
            </Link>
          </p>
          <p className="mt-3 text-sm text-stone-500">
            <Link href="/events" className="hover:text-stone-300">
              Browse all events
            </Link>
          </p>
        </section>
      </main>
    </div>
  )
}
