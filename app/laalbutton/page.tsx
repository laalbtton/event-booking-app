import type { Metadata } from 'next'
import Link from 'next/link'
import { listPublicEvents } from '@/lib/server/publicContent'
import { LBIcon, LBIconBadge } from '@/components/laalbutton/LBIcons'
import { LB_MEDIA } from '@/lib/laalbutton/media'

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
          <div className="w-full h-full flex items-center justify-center opacity-30">
            <LBIcon name="stage" accent="#6b5030" size="lg" />
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
          <LBIcon name="location" accent="#6b5030" size="sm" className="shrink-0 opacity-70" />
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
  'group relative block rounded-2xl border border-[#2a1a0e] bg-[#120c06] hover:border-[#c41e3a]/40 overflow-hidden transition-all duration-200'

function SeriesCardInner({
  title,
  description,
  accentColor,
  image,
  imageAlt,
  imageFit = 'cover',
  external,
}: {
  title: string
  description: string
  accentColor: string
  image: string
  imageAlt: string
  imageFit?: 'cover' | 'contain'
  external?: boolean
}) {
  return (
    <>
      <div className="relative aspect-[4/3] overflow-hidden bg-[#0d0a07]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt={imageAlt}
          className={`h-full w-full transition-transform duration-500 group-hover:scale-105 ${
            imageFit === 'contain' ? 'object-contain p-3' : 'object-cover'
          }`}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#120c06] to-transparent"
          aria-hidden
        />
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: accentColor, opacity: 0.7 }}
        />
      </div>
      <div className="space-y-2 p-5">
        <h3
          className="text-lg font-bold text-[#e8d9c4] leading-snug group-hover:text-[#f5a623] transition-colors"
          style={serif}
        >
          {title}
          {external && <span className="ml-1 text-[#6b5030] text-sm font-normal">↗</span>}
        </h3>
        <p className="text-sm text-[#6b5030] leading-relaxed">{description}</p>
        <div className="pt-1 text-xs font-bold uppercase tracking-widest" style={{ color: accentColor }}>
          {external ? 'Visit site' : 'Explore →'}
        </div>
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
  image,
  imageAlt,
  imageFit,
}: {
  title: string
  description: string
  href: string
  external?: boolean
  accentColor?: string
  image: string
  imageAlt: string
  imageFit?: 'cover' | 'contain'
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass}>
        <SeriesCardInner
          title={title}
          description={description}
          accentColor={accentColor}
          image={image}
          imageAlt={imageAlt}
          imageFit={imageFit}
          external
        />
      </a>
    )
  }
  return (
    <Link href={href} className={cardClass}>
      <SeriesCardInner
        title={title}
        description={description}
        accentColor={accentColor}
        image={image}
        imageAlt={imageAlt}
        imageFit={imageFit}
      />
    </Link>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function LaalButtonHome() {
  const upcomingEvents = (await listPublicEvents(3, { upcomingOnly: true })).filter(
    (e) => !e.isCancelled,
  )

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden border-b border-[#2a1a0e]">
        {/* Background layers — kept behind content so headline stays crisp */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LB_MEDIA.homeHero.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[center_25%] opacity-70"
          />
          {/* Dark scrim — heavier on the left where text sits */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a07] via-[#0d0a07]/85 to-[#0d0a07]/55" />
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(196,30,58,0.15) 0%, transparent 70%)',
            }}
          />
        </div>

        {/* Top marquee bar */}
        <div className="relative z-10 overflow-hidden bg-[#c41e3a] py-1.5 text-[11px] font-bold text-white uppercase tracking-widest">
          <div className="flex whitespace-nowrap animate-[marquee_30s_linear_infinite]">
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} className="mx-8">
                Open Mic &nbsp;·&nbsp; Comedy Shows &nbsp;·&nbsp; Punjabis in Tech &nbsp;·&nbsp; Multilingual Comedy &nbsp;·&nbsp; Roti Kapda Aur Comedy &nbsp;·&nbsp; Satrang
              </span>
            ))}
          </div>
        </div>

        <div className="relative z-10 mx-auto max-w-6xl px-5 py-20 md:py-28">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-12 text-center">
            <LBIconBadge name="mic" accentColor="#c41e3a" size="lg" className="mx-auto mb-4 opacity-80" />
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

      {/* ── Community Vibes ──────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="relative overflow-hidden rounded-2xl border border-[#2a1a0e]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LB_MEDIA.homeVibes.src}
            alt={LB_MEDIA.homeVibes.alt}
            className="w-full object-cover object-center"
            style={{ maxHeight: 420 }}
          />
          {/* Caption overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[#0d0a07]/90 via-[#0d0a07]/40 to-transparent px-6 pt-12 pb-5">
            <p className="text-[#e8d9c4] font-bold text-base" style={serif}>
              The community is real.
            </p>
            <p className="text-[#8a6a4a] text-sm mt-0.5">
              Open mics, showcases, and nights that feel like home — this is what we&apos;re building.
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <SeriesCard
            title="Punjabis in Tech"
            description="Where tech professionals meet comedy. Networking events that don't take themselves too seriously."
            href="/laalbutton/punjabis-in-tech"
            image={LB_MEDIA.punjabisInTech.src}
            imageAlt={LB_MEDIA.punjabisInTech.alt}
            accentColor="#f5a623"
          />
          <SeriesCard
            title="Multilingual Comedy Open Mics"
            description="Weekly mics in Brampton and Toronto where comedians perform in Punjabi, Hindi, Urdu, and English."
            href="/laalbutton/multilingual-comedy"
            image={LB_MEDIA.multilingualComedy.src}
            imageAlt={LB_MEDIA.multilingualComedy.alt}
            accentColor="#c41e3a"
          />
          <SeriesCard
            title="Roti Kapda Aur Comedy"
            description="An evening of South Asian stories, standup, and community. Come for the jokes, stay for the chai."
            href="/laalbutton/roti-kapda-aur-comedy"
            image={LB_MEDIA.rotiKapdaHero.src}
            imageAlt={LB_MEDIA.rotiKapdaHero.alt}
            imageFit="contain"
            accentColor="#d97706"
          />
          <SeriesCard
            title="Immigrants With Attitude"
            description="English-language South Asian comedy with bite — immigrant stories, sharp takes, and big laughs."
            href="/laalbutton/immigrants-with-attitude"
            image={LB_MEDIA.immigrantsWithAttitude.src}
            imageAlt={LB_MEDIA.immigrantsWithAttitude.alt}
            imageFit="contain"
            accentColor="#7c3aed"
          />
          <SeriesCard
            title="Satrang"
            description="A platform for South Asian arts and culture in Canada — music, spoken word, and performance."
            href="https://laalbutton.com/satrang"
            external
            image={LB_MEDIA.satrang.src}
            imageAlt={LB_MEDIA.satrang.alt}
            accentColor="#a78bfa"
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
