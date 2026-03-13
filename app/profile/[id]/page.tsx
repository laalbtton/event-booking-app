import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicPerformerProfile } from '@/lib/server/publicContent'
import { buildPerformerMetadata } from '@/lib/seo/metadata'

type Props = {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const profile = await getPublicPerformerProfile(id)
  if (!profile) {
    return {
      title: 'Performer Not Found - One Mic Stand',
      robots: { index: false, follow: false },
    }
  }
  return buildPerformerMetadata(profile)
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params
  const profile = await getPublicPerformerProfile(id)
  if (!profile) notFound()

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-3xl font-bold">{profile.fullName}</h1>
        {profile.bio ? <p className="mt-3 text-muted-foreground">{profile.bio}</p> : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Upcoming events</p>
            <p className="text-2xl font-semibold">{profile.upcomingCount}</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="text-xs text-muted-foreground">Attended events</p>
            <p className="text-2xl font-semibold">{profile.attendedCount}</p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-xl font-semibold">Upcoming performances</h2>
          {profile.upcomingEvents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No upcoming performances listed.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {profile.upcomingEvents.map((event) => (
                <li key={`${event.id}-${event.bookingStatus}`} className="rounded-lg border p-3">
                  <Link href={`/events/${event.slug || event.id}`} className="font-medium hover:underline">
                    {event.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {new Date(event.date).toLocaleString()} - {event.location || 'Venue TBA'}
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
