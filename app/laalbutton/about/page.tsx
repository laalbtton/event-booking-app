import type { Metadata } from 'next'
import Link from 'next/link'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'About',
  description:
    'At Laal Button we strive to provide opportunities for new immigrants and settlers from South Asian backgrounds to come together in a safe and inclusive place to celebrate the love and passion for performing arts.',
  openGraph: {
    title: 'About Laal Button Comedy',
    description:
      'A safe, inclusive stage for South Asian immigrants and settlers to share laughs, struggles, and culture through performing arts.',
    url: 'https://laalbutton.com/laalbutton/about',
    images: [{ url: LB_MEDIA.aboutHero.src, alt: LB_MEDIA.aboutHero.alt }],
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

const PILLARS = [
  {
    title: 'A safe stage',
    body: 'We create rooms where South Asian artists and audiences can show up as themselves — in Punjabi, Hindi, Urdu, English, or whatever language the joke needs.',
  },
  {
    title: 'Community first',
    body: 'Each event is a chance to share struggles, laughs, and the stressors of building a life far from home — and to leave with real connections.',
  },
  {
    title: 'Talent upfront',
    body: 'We set the stage, quite literally, to bring South Asian talent to the forefront — open mics, showcases, workshops, and one-of-a-kind nights.',
  },
]

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LB_MEDIA.aboutHero.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-40"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a07] via-[#0d0a07]/90 to-[#0d0a07]/70" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,30,58,0.14) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Link
            href="/laalbutton"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6b5030] hover:text-[#f5a623] uppercase tracking-widest mb-8 transition-colors"
          >
            ← Back
          </Link>

          <div className="max-w-2xl">
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-4">About Us</p>
            <h1 className="text-5xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              We set the stage
              <br />
              <span className="text-[#f5a623]">for South Asian talent.</span>
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed">
              Laal Button is Toronto and Brampton&apos;s South Asian comedy and performing arts community —
              open mics, showcases, and nights where our stories get the mic.
            </p>
          </div>
        </div>
      </section>

      {/* Mission — adapted from https://laalbutton.com/about + Eventbrite organizer copy */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em]">Our Mission</p>
            <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
              Come together. Celebrate the arts.
            </h2>
            <p className="text-[#6b5030] leading-relaxed">
              At Laal Button we strive to provide opportunities for new immigrants and settlers from South
              Asian backgrounds to come together in a safe and inclusive place to celebrate the love and
              passion for performing arts.
            </p>
            <p className="text-[#6b5030] leading-relaxed">
              Each endeavor allows the community to come together and share struggles, laughs, stressors of
              being in a distant place, and nurture meaningful and deep cultural as well as social
              connections.
            </p>
            <p className="text-[#6b5030] leading-relaxed">
              We set the stage, quite literally, to bring South Asian talent to the forefront.
            </p>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.aboutCollage.src}
              alt={LB_MEDIA.aboutCollage.alt}
              className="w-full h-auto block object-cover"
            />
          </div>
        </div>
      </section>

      {/* Pillars */}
      <section className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLARS.map((pillar) => (
            <div key={pillar.title} className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-6">
              <h3 className="text-lg font-black text-[#e8d9c4] mb-2" style={serif}>
                {pillar.title}
              </h3>
              <p className="text-[#6b5030] text-sm leading-relaxed">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Signature shows */}
      <section className="mx-auto max-w-6xl px-5 py-14 border-t border-[#2a1a0e]">
        <div className="mb-8 max-w-2xl">
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-2">Signature Nights</p>
          <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
            Shows that built the brand
          </h2>
          <p className="text-[#6b5030] text-sm leading-relaxed mt-3">
            Beyond the weekly mics — curated showcases and specials that put South Asian stories centre stage.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              ...LB_MEDIA.rotiKapdaFirst,
              title: 'Roti Kapda Aur Comedy',
              href: '/laalbutton/roti-kapda-aur-comedy',
            },
            {
              ...LB_MEDIA.immigrantsWithAttitude,
              title: 'Immigrants With Attitude',
              href: '/laalbutton/immigrants-with-attitude' as string | null,
            },
            {
              ...LB_MEDIA.loveShadiAurDepression,
              title: 'Love Shadi Aur Depression',
              href: null as string | null,
            },
            {
              ...LB_MEDIA.darkComedyMic,
              title: 'Dark Comedy Mic',
              href: null as string | null,
            },
          ].map((show) => {
            const card = (
              <div className="group rounded-2xl border border-[#2a1a0e] bg-[#120c06] overflow-hidden hover:border-[#c41e3a]/40 transition-colors h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={show.src}
                  alt={show.alt}
                  className="w-full aspect-square object-contain bg-[#0d0a07] p-2"
                />
                <p className="px-4 py-3 text-sm font-bold text-[#c8a882] group-hover:text-[#f5a623] transition-colors">
                  {show.title}
                </p>
              </div>
            )
            return show.href ? (
              <Link key={show.title} href={show.href}>
                {card}
              </Link>
            ) : (
              <div key={show.title}>{card}</div>
            )
          })}
        </div>
      </section>

      {/* Vibes gallery */}
      <section className="mx-auto max-w-6xl px-5 py-14 border-t border-[#2a1a0e]">
        <div className="mb-8 max-w-2xl">
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-2">The Vibes</p>
          <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
            Rooms that feel like ours
          </h2>
          <p className="text-[#6b5030] text-sm leading-relaxed mt-3">
            From packed open mics to one-night showcases — this is what the community looks like when it
            shows up.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.homeVibes.src}
              alt={LB_MEDIA.homeVibes.alt}
              className="w-full h-full min-h-[240px] object-cover"
            />
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.aboutWithSamay.src}
              alt={LB_MEDIA.aboutWithSamay.alt}
              className="w-full h-full min-h-[240px] object-cover"
            />
          </div>
          <div className="md:col-span-2 overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LB_MEDIA.ryansChaiVibe.src}
              alt={LB_MEDIA.ryansChaiVibe.alt}
              className="w-full max-h-[420px] object-cover object-center"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] px-8 py-12 text-center">
          <h2 className="text-2xl md:text-3xl font-black text-[#e8d9c4] mb-3" style={serif}>
            Be part of the next chapter
          </h2>
          <p className="text-[#6b5030] text-sm mb-6 max-w-lg mx-auto">
            Book a spot, catch a show, or join the app — the stage is open.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/laalbutton#events"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c41e3a] text-white font-bold text-sm hover:bg-[#a01830] transition-colors"
            >
              See Upcoming Events
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
            >
              Join the App
            </Link>
          </div>
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');`}</style>
    </>
  )
}
