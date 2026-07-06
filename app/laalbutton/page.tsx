import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'Laal Button Comedy — Toronto South Asian Comedy',
  description:
    "Toronto's South Asian comedy community. Open mics, showcases, and spaces where South Asian stories live on stage. Find and book upcoming shows.",
  openGraph: {
    title: 'Laal Button Comedy',
    description: "Toronto's South Asian comedy community — open mics, showcases, Punjabis in Tech, and more.",
    url: 'https://laalbutton.com',
    type: 'website',
  },
}

// ── Serif style helper ──────────────────────────────────────────────────────
const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

// ── Event card ───────────────────────────────────────────────────────────────
function EventCard({ event }: { event: Awaited<ReturnType<typeof listPublicEvents>>[number] }) {
  const date = new Date(event.startDate)
  const day = date.toLocaleDateString('en-CA', { weekday: 'short' })
  const mon = date.toLocaleDateString('en-CA', { month: 'short' })
  const num = date.getDate()
  const time = date.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })

  const href = `/events/${event.slug ?? event.id}`
  const location = event.venue?.name || event.locationText || 'Toronto'

  return (
    <a
      href={href}
      className="group block rounded-xl border border-[#2a1a0e] bg-[#120c06] hover:border-[#c41e3a]/50 hover:bg-[#1a0e07] transition-all duration-200 overflow-hidden"
    >
      {/* Poster or placeholder */}
      <div className="relative h-40 overflow-hidden bg-[#1a0e07]">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-5xl opacity-20">🎤</span>
          </div>
        )}
        {/* Date badge */}
        <div className="absolute top-3 left-3 rounded-lg bg-[#0d0a07]/90 border border-[#2a1a0e] px-2 py-1.5 text-center min-w-[44px]">
          <p className="text-[10px] font-bold text-[#8a6a4a] uppercase tracking-widest leading-none">{mon}</p>
          <p className="text-lg font-black text-[#f5a623] leading-none mt-0.5">{num}</p>
          <p className="text-[9px] text-[#6b5030] uppercase tracking-wide leading-none mt-0.5">{day}</p>
        </div>
        {event.isFree && (
          <div className="absolute top-3 right-3 rounded-full bg-[#c41e3a] px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
            Free
          </div>
        )}
        {event.ticketsEnabled && !event.isFree && (
          <div className="absolute top-3 right-3 rounded-full bg-[#f5a623] px-2 py-0.5 text-[10px] font-bold text-[#0d0a07] uppercase tracking-wide">
            Tickets
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        <h3 className="font-bold text-[#e8d9c4] text-sm leading-snug line-clamp-2 group-hover:text-[#f5a623] transition-colors">
          {event.title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-[#6b5030]">
          <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="truncate">{location}</span>
          <span className="text-[#3a2a18] mx-1">·</span>
          <span className="shrink-0">{time}</span>
        </div>
      </div>
    </a>
  )
}

// ── Sub-page card ────────────────────────────────────────────────────────────
const cardClass =
  'group relative block rounded-2xl border border-[#2a1a0e] bg-[#120c06] hover:border-[#c41e3a]/40 overflow-hidden transition-all duration-200 p-6'

function SeriesCardInner({
  title,
  description,
  accentColor,
  emoji,
  external,
}: {
  title: string
  description: string
  accentColor: string
  emoji: string
  external?: boolean
}) {
  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 h-0.5 transition-all duration-300"
        style={{ background: accentColor, opacity: 0.6 }}
      />
      <div className="space-y-3">
        <div className="text-3xl">{emoji}</div>
        <h3
          className="text-lg font-bold text-[#e8d9c4] leading-snug group-hover:text-[#f5a623] transition-colors"
          style={serif}
        >
          {title}
          {external && <span className="ml-1 text-[#6b5030] text-sm font-normal">↗</span>}
        </h3>
        <p className="text-sm text-[#6b5030] leading-relaxed">{description}</p>
      </div>
      <div className="mt-4 text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>
        {external ? 'Visit site' : 'Explore →'}
      </div>
    </>
  )
}

function SeriesCard({
  title,
  description,
  href,
  external,
  accentColor = '#c41e3a',
  emoji,
}: {
  title: string
  description: string
  href: string
  external?: boolean
  accentColor?: string
  emoji: string
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
        <SeriesCardInner title={title} description={description} accentColor={accentColor} emoji={emoji} external />
      </a>
    )
  }
  return (
    <Link href={href} className={cardClass}>
      <SeriesCardInner title={title} description={description} accentColor={accentColor} emoji={emoji} />
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function LaalButtonHome() {
  const now = new Date()
  const allEvents = await listPublicEvents(30)
  const upcomingEvents = allEvents
    .filter((e) => !e.isCancelled && new Date(e.startDate) >= now)
    .slice(0, 8)

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        {/* Crowd photo as hero background */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/brampton-comedy-crowd.jpg"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ opacity: 0.12 }}
        />
        {/* Dark overlay + radial glow on top of photo */}
        <div aria-hidden className="absolute inset-0 bg-[#0d0a07]/60" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(196,30,58,0.18) 0%, transparent 70%)',
          }}
        />

        {/* Top marquee bar */}
        <div className="relative overflow-hidden bg-[#c41e3a] py-1.5 text-[11px] font-bold text-white uppercase tracking-widest">
          <div className="flex whitespace-nowrap animate-[marquee_30s_linear_infinite]">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="mx-8">
                Open Mic &nbsp;·&nbsp; Comedy Shows &nbsp;·&nbsp; Punjabis in Tech &nbsp;·&nbsp; Multilingual Comedy &nbsp;·&nbsp; Roti Kapda Aur Comedy &nbsp;·&nbsp; Satrang
              </span>
            ))}
          </div>
        </div>

        <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
          <div className="max-w-3xl">
            {/* Eyebrow */}
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-4">
              Toronto · Canada
            </p>

            {/* Headline */}
            <h1
              className="text-5xl md:text-7xl font-black tracking-tight leading-[0.95] text-[#e8d9c4] mb-6"
              style={serif}
            >
              South Asian
              <br />
              <span className="text-[#f5a623]">Comedy</span>
              <br />
              Lives Here.
            </h1>

            <p className="text-[#8a6a4a] text-lg md:text-xl leading-relaxed max-w-xl mb-10">
              Open mics, showcases, and community events where South Asian voices take the stage.
              Every week in Toronto and Brampton.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="#events"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c41e3a] text-white font-bold text-sm hover:bg-[#a01830] transition-colors"
              >
                See Upcoming Events
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
              >
                Join the Community
              </Link>
            </div>
          </div>
        </div>

        {/* Decorative diagonal bottom */}
        <div
          aria-hidden
          className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #c41e3a40, transparent)' }}
        />
      </section>

      {/* ── Upcoming Events ────────────────────────────────────────────────── */}
      <section id="events" className="mx-auto max-w-6xl px-5 py-16">
        <div className="flex items-end justify-between mb-10">
          <div>
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-2">What&apos;s On</p>
            <h2 className="text-3xl md:text-4xl font-black text-[#e8d9c4]" style={serif}>
              Upcoming Events
            </h2>
          </div>
          <Link
            href="/events"
            className="text-sm font-bold text-[#6b5030] hover:text-[#f5a623] transition-colors hidden sm:block"
          >
            View all →
          </Link>
        </div>

        {upcomingEvents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-12 text-center">
            <p className="text-3xl mb-3">🎤</p>
            <p className="text-[#6b5030] text-sm">New events are being scheduled — check back soon.</p>
          </div>
        )}

        <div className="mt-8 text-center sm:hidden">
          <Link
            href="/events"
            className="inline-flex items-center gap-2 text-sm font-bold text-[#6b5030] hover:text-[#f5a623] transition-colors"
          >
            View all events →
          </Link>
        </div>
      </section>

      {/* ── Community Photo ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="relative overflow-hidden rounded-2xl border border-[#2a1a0e]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/brampton-comedy-crowd.jpg"
            alt="Audience at a comedy show at Ryan's Chai, Brampton"
            className="w-full object-cover"
            style={{ maxHeight: 420 }}
          />
          {/* Caption overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0d0a07]/90 via-[#0d0a07]/40 to-transparent px-6 pt-12 pb-5">
            <p className="text-[#e8d9c4] font-bold text-base" style={serif}>
              The community is real.
            </p>
            <p className="text-[#8a6a4a] text-sm mt-0.5">
              A packed show at Ryan&apos;s Chai, Brampton — this is what we&apos;re building.
            </p>
          </div>
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-5">
        <div className="h-px bg-gradient-to-r from-transparent via-[#2a1a0e] to-transparent" />
      </div>

      {/* ── Our Series ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="mb-10">
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-2">What We Do</p>
          <h2 className="text-3xl md:text-4xl font-black text-[#e8d9c4]" style={serif}>
            Our Event Series
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SeriesCard
            title="Punjabis in Tech"
            description="Where tech professionals meet comedy. Networking events that don't take themselves too seriously."
            href="/laalbutton/punjabis-in-tech"
            emoji="💻"
            accentColor="#f5a623"
          />
          <SeriesCard
            title="Multilingual Comedy Open Mics"
            description="Weekly mics in Brampton and Toronto where comedians perform in Punjabi, Hindi, Urdu, and English."
            href="/laalbutton/multilingual-comedy"
            emoji="🎤"
            accentColor="#c41e3a"
          />
          <SeriesCard
            title="Roti Kapda Aur Comedy"
            description="An evening of South Asian stories, standup, and community. Come for the jokes, stay for the chai."
            href="/laalbutton/roti-kapda-aur-comedy"
            emoji="🍛"
            accentColor="#d97706"
          />
          <SeriesCard
            title="Satrang"
            description="A platform for South Asian arts and culture in Canada — music, spoken word, and performance."
            href="https://satrang.ca"
            external
            emoji="🎨"
            accentColor="#7c3aed"
          />
        </div>
      </section>

      {/* ── Divider ──────────────────────────────────────────────────────── */}
      <div className="mx-auto max-w-6xl px-5">
        <div className="h-px bg-gradient-to-r from-transparent via-[#2a1a0e] to-transparent" />
      </div>

      {/* ── App CTA ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] px-8 py-14 text-center relative overflow-hidden">
          {/* Glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(196,30,58,0.12) 0%, transparent 70%)',
            }}
          />
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-3 relative">
            One Mic Stand App
          </p>
          <h2
            className="text-3xl md:text-4xl font-black text-[#e8d9c4] mb-4 relative"
            style={serif}
          >
            Book Your Spot.
            <br />
            <span className="text-[#f5a623]">Be Part of the Story.</span>
          </h2>
          <p className="text-[#6b5030] text-base mb-8 max-w-lg mx-auto relative">
            Create a free account on the One Mic Stand app to book performer spots, register as audience, and track your comedy journey.
          </p>
          <div className="flex flex-wrap gap-3 justify-center relative">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-[#c41e3a] text-white font-bold text-sm hover:bg-[#a01830] transition-colors"
            >
              Create Free Account
            </Link>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
            >
              Browse Events
            </Link>
          </div>
        </div>
      </section>

      {/* Marquee animation style */}
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
      `}</style>
    </>
  )
}
