import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'
import { buildEventListMetadata } from '@/lib/seo/metadata'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const events = await listPublicEvents(200)
  return buildEventListMetadata(events.length)
}

export default async function PublicEventsPage() {
  const events = await listPublicEvents(200)
  const now = Date.now()
  const upcoming = events.filter((event) => new Date(event.startDate).getTime() >= now)
  const recent = events.filter((event) => new Date(event.startDate).getTime() < now).slice(0, 30)

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-3xl font-bold tracking-tight">Open Mic Events</h1>
        <p className="mt-2 text-muted-foreground">Browse upcoming and recent events.</p>

        <section className="mt-8 space-y-3">
          <h2 className="text-xl font-semibold">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming events right now.</p>
          ) : (
            <ul className="space-y-3">
              {upcoming.map((event) => (
                <li key={event.id} className="rounded-lg border p-4">
                  <Link href={`/events/${event.slug || event.id}`} className="font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.startDate).toLocaleString()} - {event.venue?.name || event.locationText || 'Venue TBA'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Recent</h2>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent events.</p>
          ) : (
            <ul className="space-y-3">
              {recent.map((event) => (
                <li key={event.id} className="rounded-lg border p-4">
                  <Link href={`/events/${event.slug || event.id}`} className="font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.startDate).toLocaleString()} - {event.venue?.name || event.locationText || 'Venue TBA'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
