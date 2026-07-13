import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'
import { LBFeatureRow } from '@/components/laalbutton/LBIcons'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Punjabis in Tech',
  description:
    'Where tech professionals meet comedy. A Laal Button networking series that brings together South Asian tech talent for laughs, connections, and good conversations.',
  openGraph: {
    title: 'Punjabis in Tech | Laal Button Comedy',
    description: 'Networking events where South Asian tech professionals meet comedy.',
    url: 'https://laalbutton.com/laalbutton/punjabis-in-tech',
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

const TIMELINE = [
  {
    label: 'Edition 1',
    date: 'March 2024',
    venue: 'Toronto',
    description: 'The first gathering — over 80 South Asian tech professionals and comedians in one room.',
  },
  {
    label: 'Edition 2',
    date: 'September 2024',
    venue: 'Toronto',
    description: 'Bigger lineup, more laughs, more connections. A full house that proved this community needed a home.',
  },
]

export default async function PunjabisInTechPage() {
  const now = new Date()
  const allEvents = await listPublicEvents(30)
  const pitEvents = allEvents.filter(
    (e) =>
      !e.isCancelled &&
      new Date(e.startDate) >= now &&
      e.title.toLowerCase().includes('punjabi'),
  )

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(245,166,35,0.12) 0%, transparent 70%)',
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
            <p className="text-[#f5a623] text-xs font-bold uppercase tracking-[0.2em] mb-4">Laal Button Series</p>
            <h1 className="text-5xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              Punjabis
              <br />
              in Tech
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">
              Where South Asian tech professionals meet real comedy. Networking reimagined — no elevator pitches, just laughs, jalebi, and actual human connection.
            </p>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#f5a623] text-[#0d0a07] font-bold text-sm hover:bg-[#d97706] transition-colors"
            >
              Join to Get Notified
            </Link>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.punjabisInTech.src}
              alt={LB_MEDIA.punjabisInTech.alt}
              className="w-full h-auto block"
            />
          </div>
        </div>
      </section>

      {/* About */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em]">About the Series</p>
            <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
              Networking, but make it funny.
            </h2>
            <p className="text-[#6b5030] leading-relaxed">
              Punjabis in Tech was born out of a simple observation: South Asian tech professionals have been quietly shaping the industry for decades, but rarely get a room that feels like ours. We built one — and added a comedy show.
            </p>
            <p className="text-[#6b5030] leading-relaxed">
              Every edition features a mix of standup comedy, panel conversations, and unstructured networking time. Expect to meet a founder, laugh until your chai goes cold, and leave with a business card you'll actually follow up on.
            </p>
          </div>
          <div className="space-y-4">
            <LBFeatureRow name="mic" label="Live comedy sets" accentColor="#f5a623" />
            <LBFeatureRow name="chat" label="Community conversations" accentColor="#f5a623" />
            <LBFeatureRow name="network" label="Genuine networking" accentColor="#f5a623" />
            <LBFeatureRow name="chai" label="South Asian food and chai" accentColor="#f5a623" />
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
        <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-8">Our Journey</p>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-[#2a1a0e] hidden sm:block" />
          <div className="space-y-8">
            {TIMELINE.map((item, i) => (
              <div key={i} className="sm:pl-12 relative">
                <div className="hidden sm:block absolute left-0 top-1.5 h-4 w-4 rounded-full border-2 border-[#c41e3a] bg-[#0d0a07]" />
                <div className="rounded-xl border border-[#2a1a0e] bg-[#120c06] p-5">
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="text-base font-black text-[#f5a623]"
                      style={serif}
                    >
                      {item.label}
                    </span>
                    <span className="text-[#3a2a18] text-xs">·</span>
                    <span className="text-[#6b5030] text-xs">{item.date}</span>
                    <span className="text-[#3a2a18] text-xs">·</span>
                    <span className="text-[#6b5030] text-xs">{item.venue}</span>
                  </div>
                  <p className="text-[#6b5030] text-sm leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Upcoming events (filtered) */}
      {pitEvents.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-6">Coming Up</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {pitEvents.map((e) => (
              <Link
                key={e.id}
                href={`/events/${e.slug ?? e.id}`}
                className="block rounded-xl border border-[#2a1a0e] bg-[#120c06] hover:border-[#f5a623]/40 p-5 transition-all"
              >
                <p className="text-xs text-[#6b5030] mb-1">
                  {new Date(e.startDate).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="font-bold text-[#e8d9c4] text-sm">{e.title}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-12 border-t border-[#2a1a0e]">
        <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-10 text-center">
          <h2 className="text-2xl font-black text-[#e8d9c4] mb-3" style={serif}>Next edition coming soon</h2>
          <p className="text-[#6b5030] text-sm mb-6">Join the app to be the first to know when tickets drop.</p>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#f5a623] text-[#0d0a07] font-bold text-sm hover:bg-[#d97706] transition-colors"
          >
            Create Free Account
          </Link>
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');`}</style>
    </>
  )
}
