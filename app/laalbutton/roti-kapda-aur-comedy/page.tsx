import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Roti Kapda Aur Comedy',
  description:
    'An evening of South Asian stories, standup comedy, and community. Come for the jokes, stay for the chai. A Laal Button showcase series.',
  openGraph: {
    title: 'Roti Kapda Aur Comedy | Laal Button Comedy',
    description: 'An evening of South Asian stories, standup, and community.',
    url: 'https://laalbutton.com/laalbutton/roti-kapda-aur-comedy',
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

export default async function RotiKapdaAurComedyPage() {
  const now = new Date()
  const allEvents = await listPublicEvents(30)

  // Filter events related to this series
  const rkacEvents = allEvents.filter(
    (e) =>
      !e.isCancelled &&
      new Date(e.startDate) >= now &&
      (e.title.toLowerCase().includes('roti') ||
        e.title.toLowerCase().includes('kapda') ||
        e.title.toLowerCase().includes('rkac')),
  )

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(217,119,6,0.12) 0%, transparent 70%)',
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
            <p className="text-[#d97706] text-xs font-bold uppercase tracking-[0.2em] mb-4">Laal Button Showcase</p>
            <h1 className="text-4xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              Roti Kapda
              <br />
              <span className="text-[#d97706]">Aur Comedy</span>
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">
              A curated evening of South Asian standup, storytelling, and community. Named after Manoj Kumar&apos;s classic film — because our stories about roti, kapda, and everything in between deserve to be on stage.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#upcoming"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#d97706] text-[#0d0a07] font-bold text-sm hover:bg-[#b45309] transition-colors"
              >
                Upcoming Shows
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#d97706]/40 hover:text-[#f5a623] transition-colors"
              >
                Join to Get Tickets
              </Link>
            </div>
          </div>

          {/* Placeholder image */}
          <div className="mt-12 rounded-2xl border border-[#2a1a0e] bg-[#120c06] h-56 md:h-72 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-5xl">🍛</p>
              <p className="text-[#3a2a18] text-sm">Event photo coming soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <p className="text-[#d97706] text-xs font-bold uppercase tracking-[0.2em]">The Show</p>
            <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
              Real life. Told with humour.
            </h2>
            <p className="text-[#6b5030] leading-relaxed">
              Roti Kapda Aur Comedy is an evening showcase series featuring some of the sharpest South Asian voices in Canadian comedy. Every show is a mix of standup, stories, and the kind of jokes your aunties would pretend not to laugh at.
            </p>
            <p className="text-[#6b5030] leading-relaxed">
              Expect to hear about immigration paperwork, arranged marriages, biryani politics, and the existential dread of being asked &quot;so what do your parents think of your comedy career.&quot;
            </p>
          </div>
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-7 space-y-5">
            <p className="text-[#d97706] text-xs font-bold uppercase tracking-[0.2em]">What to Expect</p>
            {[
              { e: '🎤', t: 'Curated standup lineup', s: '4–6 headlining comedians' },
              { e: '🌮', t: 'South Asian food & chai', s: 'Come hungry' },
              { e: '🎟', t: 'Ticketed event', s: 'Limited seating, book early' },
              { e: '🤝', t: 'Community first', s: 'A room that feels like home' },
            ].map((item) => (
              <div key={item.t} className="flex items-center gap-4">
                <span className="text-2xl">{item.e}</span>
                <div>
                  <p className="text-[#c8a882] font-bold text-sm">{item.t}</p>
                  <p className="text-[#4a3520] text-xs">{item.s}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming events */}
      <section id="upcoming" className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
        <p className="text-[#d97706] text-xs font-bold uppercase tracking-[0.2em] mb-6">Upcoming Shows</p>

        {rkacEvents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rkacEvents.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.slug ?? e.id}`}
                className="group block rounded-xl border border-[#2a1a0e] bg-[#120c06] hover:border-[#d97706]/40 p-5 transition-all"
              >
                <p className="text-xs text-[#6b5030] mb-1">
                  {new Date(e.startDate).toLocaleDateString('en-CA', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
                <p className="font-bold text-[#e8d9c4] text-sm group-hover:text-[#d97706] transition-colors">
                  {e.title}
                </p>
                {e.venue && (
                  <p className="text-xs text-[#4a3520] mt-1">{e.venue.name}</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-10 text-center">
            <p className="text-3xl mb-3">🍛</p>
            <p className="text-[#6b5030] text-sm mb-4">No shows scheduled right now — next one is being planned.</p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#d97706] text-[#0d0a07] text-sm font-bold hover:bg-[#b45309] transition-colors"
            >
              Join to Get Notified
            </Link>
          </div>
        )}
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');`}</style>
    </>
  )
}
