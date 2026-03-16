import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { HomeAuthRedirect } from '@/components/public/HomeAuthRedirect'
import { listPublicEvents } from '@/lib/server/publicContent'
import { listPublicCommunities } from '@/lib/server/publicCommunities'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'One Mic Stand — Find Open Mic & Comedy Events in Canada',
  description:
    'Discover upcoming open mic nights, comedy shows, and live performance events. Book a performer spot or register as an audience member — no account needed to browse.',
  openGraph: {
    title: 'One Mic Stand',
    description: 'Discover upcoming open mic nights, comedy shows, and live performance events.',
    url: 'https://app.laalbutton.com',
    siteName: 'One Mic Stand',
    type: 'website',
  },
}

export default async function Home() {
  const now = new Date()

  const [allEvents, communities] = await Promise.all([
    listPublicEvents(20),
    listPublicCommunities(),
  ])

  const upcomingEvents = allEvents
    .filter((e) => !e.isCancelled && new Date(e.startDate) >= now)
    .slice(0, 4)

  const featuredCommunities = communities.slice(0, 3)

  return (
    <>
      {/* Invisible — redirects logged-in users to /dashboard */}
      <HomeAuthRedirect />

      <PublicHeader />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-blue-600 to-purple-700 text-white py-16 px-4 overflow-hidden">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center gap-8 md:gap-12">
          {/* Text + CTAs */}
          <div className="flex-1 text-center md:text-left">
            <h1 className="text-5xl md:text-6xl font-bold mb-4 drop-shadow-lg tracking-tight">
              One Mic Stand
            </h1>
            <p className="text-xl md:text-2xl mb-10 opacity-90 leading-relaxed">
              Discover and perform at comedy &amp; open mic events across Canada
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
              <Link
                href="/events"
                className="bg-white text-blue-700 px-8 py-4 rounded-xl font-semibold hover:bg-blue-50 text-lg shadow-lg transition-colors"
              >
                Browse Events
              </Link>
              <Link
                href="/signup"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-xl font-semibold hover:bg-white hover:text-blue-700 text-lg shadow-lg transition-colors"
              >
                Sign Up Free
              </Link>
            </div>
            <p className="mt-6 text-sm opacity-75 text-center md:text-left">
              Already have an account?{' '}
              <Link href="/login" className="underline underline-offset-2 hover:opacity-100">
                Log in
              </Link>
            </p>
          </div>

          {/* Brand illustration */}
          <div className="shrink-0 w-64 md:w-80 lg:w-96 opacity-90 drop-shadow-2xl">
            <Image
              src="/mic-stool.png"
              alt="Microphone and stool — One Mic Stand"
              width={400}
              height={300}
              className="w-full h-auto object-contain"
              priority
            />
          </div>
        </div>
      </section>

      {/* ── Upcoming Events ───────────────────────────────────────── */}
      {upcomingEvents.length > 0 && (
        <section className="py-12 px-4 bg-background">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Upcoming Events</h2>
              <Link href="/events" className="text-sm text-primary hover:underline font-medium">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {upcomingEvents.map((event) => (
                <PublicEventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── How It Works ──────────────────────────────────────────── */}
      <section className="py-14 px-4 bg-muted/40">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-10">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-card rounded-2xl border p-6 text-center space-y-3 shadow-sm">
              <div className="text-4xl">🎤</div>
              <h3 className="text-lg font-semibold">Performers</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Find open mics and shows near you, book your spot online, and get on stage.
              </p>
              <Link
                href="/signup?role=performer"
                className="inline-block mt-2 text-sm text-primary font-medium hover:underline"
              >
                Sign up as a performer →
              </Link>
            </div>

            <div className="bg-card rounded-2xl border p-6 text-center space-y-3 shadow-sm">
              <div className="text-4xl">🎟️</div>
              <h3 className="text-lg font-semibold">Audience</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Discover live comedy in your city, register for free or buy tickets, and enjoy the show.
              </p>
              <Link
                href="/signup?role=audience"
                className="inline-block mt-2 text-sm text-primary font-medium hover:underline"
              >
                Sign up as an audience member →
              </Link>
            </div>

            <div className="bg-card rounded-2xl border p-6 text-center space-y-3 shadow-sm">
              <div className="text-4xl">🏘️</div>
              <h3 className="text-lg font-semibold">Communities</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Join your city&apos;s comedy community, stay in the loop on upcoming events, and connect with other performers.
              </p>
              <Link
                href="/communities"
                className="inline-block mt-2 text-sm text-primary font-medium hover:underline"
              >
                Browse communities →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Communities ──────────────────────────────────────────── */}
      {featuredCommunities.length > 0 && (
        <section className="py-12 px-4 bg-background">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">Communities</h2>
              <Link href="/communities" className="text-sm text-primary hover:underline font-medium">
                Browse all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {featuredCommunities.map((c) => (
                <Link
                  key={c.id}
                  href={`/communities/${c.slug || c.id}`}
                  className="group block rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-shadow"
                >
                  <h3 className="font-semibold text-base group-hover:text-primary transition-colors">
                    {c.name}
                  </h3>
                  {c.location && (
                    <p className="text-xs text-muted-foreground mt-0.5">{c.location}</p>
                  )}
                  {c.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2 leading-relaxed">
                      {c.description}
                    </p>
                  )}
                  <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                    <span>{c.memberCount} {c.memberCount === 1 ? 'member' : 'members'}</span>
                    <span>{c.upcomingEventCount} upcoming {c.upcomingEventCount === 1 ? 'event' : 'events'}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Bottom CTA ────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-gradient-to-br from-blue-600 to-purple-700 text-white text-center">
        <h2 className="text-3xl font-bold mb-3">Ready to take the mic?</h2>
        <p className="text-lg opacity-90 mb-8 max-w-xl mx-auto">
          Join performers and fans finding their stage across Canada.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/signup"
            className="bg-white text-blue-700 px-8 py-3 rounded-xl font-semibold hover:bg-blue-50 shadow-lg transition-colors text-lg"
          >
            Sign Up Free
          </Link>
          <Link
            href="/login"
            className="border-2 border-white text-white px-8 py-3 rounded-xl font-semibold hover:bg-white hover:text-blue-700 transition-colors text-lg"
          >
            Log In
          </Link>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <footer className="py-8 px-4 border-t bg-background">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-bold text-foreground">One Mic Stand</span>
          <nav className="flex flex-wrap gap-5 text-sm text-muted-foreground">
            <Link href="/events" className="hover:text-foreground transition-colors">
              Events
            </Link>
            <Link href="/communities" className="hover:text-foreground transition-colors">
              Communities
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground transition-colors">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </>
  )
}
