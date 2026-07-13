import Link from 'next/link'
import { LBFeatureRow, LBIconBadge, LBImagePlaceholder } from '@/components/laalbutton/LBIcons'
import { MicNightStoryTimeline } from '@/components/laalbutton/MicNightStoryTimeline'
import type { MicStoryChapter, MicStoryIntro } from '@/lib/laalbutton/micOpenMicStory'
import type { MicNightData } from '@/lib/laalbutton/micNights'

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

type NextEventInfo = {
  href: string
  title: string
  dateLabel: string
}

type Props = {
  mic: MicNightData
  heroImageSrc?: string
  heroImageAlt?: string
  /** Overrides static mic.time — e.g. from next upcoming app event */
  displayTime?: string
  displayTimeNote?: string
  nextEvent?: NextEventInfo | null
  storyChapters?: MicStoryChapter[]
  storyIntro?: MicStoryIntro
}

export function MicNightDetail({
  mic,
  heroImageSrc,
  heroImageAlt,
  displayTime,
  displayTimeNote,
  nextEvent,
  storyChapters,
  storyIntro,
}: Props) {
  const timeLabel = displayTime ?? mic.time
  const otherSlug =
    mic.slug === 'brampton-open-mic' ? 'toronto-open-mic' : 'brampton-open-mic'
  const otherMic =
    mic.slug === 'brampton-open-mic' ? 'Toronto Open Mic' : 'Brampton Open Mic'
  const otherHref = `/laalbutton/multilingual-comedy/${otherSlug}`

  return (
    <>
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(ellipse 70% 50% at 50% 0%, ${mic.accentColor}22 0%, transparent 70%)`,
          }}
        />
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <Link
            href="/laalbutton/multilingual-comedy"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#6b5030] hover:text-[#f5a623] uppercase tracking-widest mb-8 transition-colors"
          >
            ← Multilingual Comedy
          </Link>

          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] mb-4" style={{ color: mic.accentColor }}>
              {mic.day} · {mic.city}
              {mic.slug === 'brampton-open-mic' && (
                <span className="text-[#8a6a4a] font-semibold normal-case tracking-normal"> · Free entry</span>
              )}
            </p>
            <h1 className="text-5xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              {mic.title}
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">{mic.description}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/signup?role=performer"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-sm transition-colors"
                style={{ backgroundColor: mic.accentColor }}
              >
                Sign Up to Perform
              </Link>
              <Link
                href="/signup?role=audience"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
              >
                Join as Audience
              </Link>
              {nextEvent && (
                <Link
                  href={nextEvent.href}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
                >
                  Next Show →
                </Link>
              )}
            </div>
          </div>

          <div className="mt-12 overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
            {heroImageSrc ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={heroImageSrc}
                alt={heroImageAlt ?? `${mic.title} at ${mic.venue}`}
                className="w-full h-auto block object-cover object-center max-h-[420px]"
              />
            ) : (
              <div className="h-56 md:h-72 flex items-center justify-center">
                <LBImagePlaceholder name="mic" accentColor={mic.accentColor} label="Event photo coming soon" />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-7 space-y-5">
            <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: mic.accentColor }}>
              When & Where
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border border-[#1a0e05] bg-[#0d0a07] px-4 py-4">
                <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-1">Venue</p>
                <p className="text-[#c8a882] text-sm font-medium">{mic.venue}</p>
                <p className="text-[#4a3520] text-xs mt-0.5">{mic.address}</p>
              </div>
              <div className="rounded-lg border border-[#1a0e05] bg-[#0d0a07] px-4 py-4">
                <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-1">Time</p>
                <p className="text-[#c8a882] text-sm font-medium">{mic.day}</p>
                <p className="text-[#4a3520] text-xs mt-0.5">{timeLabel}</p>
                {displayTimeNote && (
                  <p className="text-[#6b5030] text-[11px] mt-2 leading-snug">{displayTimeNote}</p>
                )}
              </div>
            </div>
            {nextEvent && (
              <Link
                href={nextEvent.href}
                className="block rounded-lg border border-[#1a0e05] bg-[#0d0a07] px-4 py-4 hover:border-[#c41e3a]/30 transition-colors"
              >
                <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-1">Next show</p>
                <p className="text-[#c8a882] text-sm font-medium">{nextEvent.dateLabel}</p>
                <p className="text-[#6b5030] text-xs mt-0.5">{nextEvent.title}</p>
              </Link>
            )}
            <div>
              <p className="text-[10px] font-bold text-[#4a3520] uppercase tracking-widest mb-2">Languages on stage</p>
              <div className="flex flex-wrap gap-2">
                {mic.languages.map((lang) => (
                  <span
                    key={lang}
                    className="px-2.5 py-1 rounded-full border border-[#2a1a0e] text-[#8a6a4a] text-[11px] font-medium"
                  >
                    {lang}
                  </span>
                ))}
              </div>
            </div>
            {mic.slug === 'brampton-open-mic' && (
              <p className="text-[#6b5030] text-xs leading-relaxed">
                A different host every week. Entry is free — just show up and support the room.
              </p>
            )}
            {mic.ticketUrl && (
              <a
                href={mic.ticketUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#c41e3a] text-white text-sm font-bold hover:bg-[#a01830] transition-colors"
              >
                Get Tickets ↗
              </a>
            )}
          </div>

          <div className="space-y-4">
            <LBFeatureRow name="performer" label="Performers welcome" accentColor={mic.accentColor} />
            <LBFeatureRow name="audience" label="Great audiences every week" accentColor={mic.accentColor} />
            <LBFeatureRow name="languages" label="All languages welcome on stage" accentColor={mic.accentColor} />
            <LBFeatureRow name="mic" label="Weekly open mic — book on the app" accentColor={mic.accentColor} />
          </div>
        </div>
      </section>

      {storyChapters && storyChapters.length > 0 && storyIntro && (
        <MicNightStoryTimeline chapters={storyChapters} accentColor={mic.accentColor} intro={storyIntro} />
      )}

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <LBIconBadge name="mic" accentColor={mic.accentColor} size="md" />
            <div>
              <p className="text-[#c8a882] font-bold text-sm">Also check out</p>
              <p className="text-[#6b5030] text-sm">{otherMic} — our other weekly mic</p>
            </div>
          </div>
          <Link
            href={otherHref}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#3a2a18] text-[#c8a882] text-sm font-bold hover:text-[#f5a623] transition-colors shrink-0"
          >
            View {otherMic} →
          </Link>
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');`}</style>
    </>
  )
}
