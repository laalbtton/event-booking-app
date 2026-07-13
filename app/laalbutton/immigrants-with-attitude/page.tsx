import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Immigrants With Attitude',
  description:
    'English-language South Asian comedy with bite. Immigrant stories, sharp takes, and big laughs — a Laal Button showcase series curated by Sunny Deewana.',
  openGraph: {
    title: 'Immigrants With Attitude | Laal Button Comedy',
    description: 'English-language South Asian comedy with bite — immigrant stories and sharp takes.',
    url: 'https://laalbutton.com/laalbutton/immigrants-with-attitude',
    images: [{ url: LB_MEDIA.immigrantsWithAttitudeBanner.src, alt: LB_MEDIA.immigrantsWithAttitudeBanner.alt }],
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

const ACCENT = '#7c3aed'

export default async function ImmigrantsWithAttitudePage() {
  const now = new Date()
  const allEvents = await listPublicEvents(30)

  const iwaEvents = allEvents.filter(
    (e) =>
      !e.isCancelled &&
      new Date(e.startDate) >= now &&
      (e.title.toLowerCase().includes('immigrant') ||
        e.title.toLowerCase().includes('attitude') ||
        e.title.toLowerCase().includes('iwa')),
  )

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${ACCENT}22 0%, transparent 70%)`,
          }}
        />
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Link
            href="/laalbutton"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6b5030] hover:text-[#f5a623] uppercase tracking-widest mb-8 transition-colors"
          >
            ← Back
          </Link>

          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: ACCENT }}>
              Laal Button · English Comedy
            </p>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              Immigrants
              <br />
              <span style={{ color: ACCENT }}>With Attitude</span>
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">
              English-language South Asian comedy that doesn&apos;t soft-pedal the immigrant experience.
              Curated by Sunny Deewana — sharp sets, real stories, and rooms that get it.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#upcoming"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm transition-colors hover:opacity-90"
                style={{ background: ACCENT }}
              >
                Upcoming Shows
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#7c3aed]/40 hover:text-[#f5a623] transition-colors"
              >
                Join to Get Tickets
              </Link>
            </div>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.immigrantsWithAttitudeBanner.src}
              alt={LB_MEDIA.immigrantsWithAttitudeBanner.alt}
              className="w-full h-auto block max-h-[480px] object-contain bg-[#0d0a07]"
            />
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: ACCENT }}>
              The Show
            </p>
            <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
              Attitude optional? Not here.
            </h2>
            <p className="text-[#6b5030] leading-relaxed">
              Immigrants With Attitude is Laal Button&apos;s English-language showcase for South Asian
              comedians who tell it like it is — visas, family WhatsApp groups, career pivots, and the
              absurdity of building a life between cultures.
            </p>
            <p className="text-[#6b5030] leading-relaxed">
              Born out of Brampton and Toronto stages, the series has featured lineups curated by Sunny
              Deewana and partnered with community platforms like This Is Brampton — putting immigrant
              voices front and centre in English.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#0d0a07] p-6 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.immigrantsWithAttitude.src}
              alt={LB_MEDIA.immigrantsWithAttitude.alt}
              className="w-full max-w-sm h-auto object-contain"
            />
          </div>
        </div>
      </section>

      {/* Upcoming */}
      <section id="upcoming" className="mx-auto max-w-6xl px-5 py-14 border-t border-[#2a1a0e]">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: ACCENT }}>
            What&apos;s Next
          </p>
          <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
            Upcoming Shows
          </h2>
        </div>

        {iwaEvents.length > 0 ? (
          <ul className="space-y-3">
            {iwaEvents.map((event) => {
              const date = new Date(event.startDate)
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.slug ?? event.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 rounded-xl border border-[#2a1a0e] bg-[#120c06] px-5 py-4 hover:border-[#7c3aed]/40 transition-colors"
                  >
                    <span className="text-sm font-bold shrink-0" style={{ color: ACCENT }}>
                      {date.toLocaleDateString('en-CA', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <span className="font-bold text-[#e8d9c4] flex-1">{event.title}</span>
                    <span className="text-sm text-[#6b5030]">
                      {event.venue?.name || event.locationText || 'Toronto'}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-10 text-center">
            <p className="text-[#6b5030] text-sm mb-4">
              Next edition is being planned — join the app to get notified when tickets drop.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold hover:opacity-90 transition-opacity"
              style={{ background: ACCENT }}
            >
              Get Notified
            </Link>
          </div>
        )}
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
      `}</style>
    </>
  )
}
