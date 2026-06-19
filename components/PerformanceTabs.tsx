'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { PerformerEvent } from '@/lib/server/publicContent'

type Props = {
  upcomingEvents: PerformerEvent[]
  recentEvents: PerformerEvent[]
}

function EventCard({ event }: { event: PerformerEvent }) {
  return (
    <li className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 hover:border-zinc-500 transition-colors">
      <Link
        href={`/events/${event.slug || event.id}`}
        className="font-medium text-stone-100 hover:text-yellow-400 transition-colors"
      >
        {event.title}
      </Link>
      <p className="text-sm text-stone-400 mt-1">
        {new Date(event.date).toLocaleDateString('en-CA', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })}
        {event.location ? ` · ${event.location}` : ' · Venue TBA'}
      </p>
      {event.bookingStatus === 'waitlist' && event.waitlistPosition != null && (
        <p className="text-xs text-stone-500 mt-1">Waitlist position #{event.waitlistPosition}</p>
      )}
    </li>
  )
}

export default function PerformanceTabs({ upcomingEvents, recentEvents }: Props) {
  const [tab, setTab] = useState<'upcoming' | 'recent'>('upcoming')

  return (
    <section>
      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-4 border-b border-zinc-800">
        {(
          [
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'recent',   label: 'Recent' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={[
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === key
                ? 'border-yellow-400 text-yellow-400'
                : 'border-transparent text-stone-500 hover:text-stone-300',
            ].join(' ')}
          >
            {label}
            {key === 'upcoming' && upcomingEvents.length > 0 && (
              <span className="ml-1.5 text-xs rounded-full bg-zinc-800 px-1.5 py-0.5 text-stone-500">
                {upcomingEvents.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Upcoming tab */}
      {tab === 'upcoming' && (
        upcomingEvents.length === 0 ? (
          <p className="text-sm text-stone-500">No upcoming performances listed.</p>
        ) : (
          <ul className="space-y-2">
            {upcomingEvents.map((event) => (
              <EventCard key={`${event.id}-${event.bookingStatus}`} event={event} />
            ))}
          </ul>
        )
      )}

      {/* Recent tab */}
      {tab === 'recent' && (
        recentEvents.length === 0 ? (
          <p className="text-sm text-stone-500">No recent performances on record.</p>
        ) : (
          <ul className="space-y-2">
            {recentEvents.map((event) => (
              <EventCard key={`${event.id}-recent`} event={event} />
            ))}
          </ul>
        )
      )}
    </section>
  )
}
