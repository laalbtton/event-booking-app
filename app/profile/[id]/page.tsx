import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPublicPerformerProfile } from '@/lib/server/publicContent'
import { buildPerformerMetadata } from '@/lib/seo/metadata'
import { PublicHeader } from '@/components/public/PublicHeader'

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

function SocialLink({ href, label, icon }: { href: string; label: string; icon: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 text-stone-300 text-sm hover:border-yellow-400/60 hover:text-yellow-400 transition-colors"
    >
      {icon}
      {label}
    </a>
  )
}

export default async function PublicProfilePage({ params }: Props) {
  const { id } = await params
  const profile = await getPublicPerformerProfile(id)
  if (!profile) notFound()

  const initials = profile.fullName
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const hasLinks = profile.websiteLink || profile.instagramLink || profile.youtubeLink || profile.twitterLink

  return (
    <div className="min-h-screen bg-zinc-950">
      <PublicHeader />

      <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">

        {/* ── Hero: avatar + name + bio ─────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
          {/* Avatar */}
          <div className="shrink-0">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt={profile.fullName}
                className="h-32 w-32 rounded-full object-cover ring-4 ring-zinc-700"
              />
            ) : (
              <div className="h-32 w-32 rounded-full bg-zinc-800 ring-4 ring-zinc-700 flex items-center justify-center text-3xl font-bold text-stone-400">
                {initials}
              </div>
            )}
          </div>

          {/* Name, bio, links */}
          <div className="flex-1 text-center sm:text-left space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-yellow-400">{profile.fullName}</h1>

            {profile.bio && (
              <p className="text-stone-300 leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
            )}

            {/* Social links */}
            {hasLinks && (
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                {profile.websiteLink && (
                  <SocialLink
                    href={profile.websiteLink}
                    label="Website"
                    icon={
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                    }
                  />
                )}
                {profile.instagramLink && (
                  <SocialLink
                    href={profile.instagramLink}
                    label="Instagram"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    }
                  />
                )}
                {profile.youtubeLink && (
                  <SocialLink
                    href={profile.youtubeLink}
                    label="YouTube"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M23.495 6.205a3.007 3.007 0 00-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 00.527 6.205a31.247 31.247 0 00-.522 5.805 31.247 31.247 0 00.522 5.783 3.007 3.007 0 002.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 002.088-2.088 31.247 31.247 0 00.5-5.783 31.247 31.247 0 00-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                      </svg>
                    }
                  />
                )}
                {profile.twitterLink && (
                  <SocialLink
                    href={profile.twitterLink}
                    label="X / Twitter"
                    icon={
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    }
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{profile.upcomingCount}</p>
            <p className="text-xs text-stone-400 mt-1">Upcoming performances</p>
          </div>
          <div className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 text-center">
            <p className="text-2xl font-bold text-yellow-400">{profile.attendedCount}</p>
            <p className="text-xs text-stone-400 mt-1">Events attended</p>
          </div>
        </div>

        {/* ── Upcoming performances ─────────────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-stone-200 mb-3">Upcoming performances</h2>
          {profile.upcomingEvents.length === 0 ? (
            <p className="text-sm text-stone-500">No upcoming performances listed.</p>
          ) : (
            <ul className="space-y-2">
              {profile.upcomingEvents.map((event) => (
                <li key={`${event.id}-${event.bookingStatus}`} className="rounded-xl border border-zinc-700 bg-zinc-900 p-4 hover:border-zinc-500 transition-colors">
                  <Link href={`/events/${event.slug || event.id}`} className="font-medium text-stone-100 hover:text-yellow-400 transition-colors">
                    {event.title}
                  </Link>
                  <p className="text-sm text-stone-400 mt-1">
                    {new Date(event.date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    {event.location ? ` · ${event.location}` : ' · Venue TBA'}
                  </p>
                  {event.bookingStatus === 'waitlist' && event.waitlistPosition && (
                    <p className="text-xs text-stone-500 mt-1">Waitlist position #{event.waitlistPosition}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}
