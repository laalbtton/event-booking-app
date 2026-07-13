import type { Metadata } from 'next'
import Link from 'next/link'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Workshops',
  description:
    'Laal Button workshops for South Asian creatives and community — Creativity Workshops (Improv) and Seniors Stand up Workshops in the GTA.',
  openGraph: {
    title: 'Workshops | Laal Button Comedy',
    description:
      'Improv creativity workshops and seniors standup workshops from Laal Button — learn, play, and find your voice on stage.',
    url: 'https://laalbutton.com/laalbutton/workshops',
    images: [{ url: LB_MEDIA.improvWorkshop.src, alt: LB_MEDIA.improvWorkshop.alt }],
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

/** From playlist: The Golden Age of Laughter – Senior Citizen Stand-Up Comedy Show */
const SENIORS_PLAYLIST_URL =
  'https://www.youtube.com/playlist?list=PLJsrIxMzs4EANmYEyBu9R19-cos1001Cp'

const SENIORS_VIDEOS = [
  { id: 'DY6l7QIKxM4', performer: 'Vibha Malhotra', title: 'Timeless Beauty & Wit' },
  { id: 'r3UOqnG7bvg', performer: 'Savita Aggarwal', title: 'Grandparents Gone Wild' },
  { id: 'FQWN2BN2bRQ', performer: 'Sanjeev Aggarwal', title: 'Roasting Life, Family & Aging' },
  { id: 'QgeSSA5Gn44', performer: 'Sanjay', title: 'Old is Bold' },
  { id: 'sOkxzETp4mQ', performer: 'Nirmal Sidhu', title: 'Golden Years, Golden Jokes' },
  { id: '1oQpoARCO48', performer: 'Namrata', title: 'Aging Like Fine Wine' },
] as const

const SECTIONS = [
  {
    id: 'creativity-improv',
    eyebrow: 'Creativity Workshops',
    title: 'Improv',
    accent: '#c41e3a',
    image: LB_MEDIA.improvWorkshop,
    lead: 'Play first. Perform second. Build the instincts that make comedy feel alive.',
    body: [
      'Our Creativity Workshops centre on improv — listening, saying yes, and finding the funny in the moment. Designed for South Asian performers and curious beginners who want a low-pressure room to try things out.',
      'Expect warm-ups, short-form games, scene work, and feedback that keeps the energy high. Whether you are prepping for open mics or just want to loosen up creatively, this is a space to practice without the spotlight pressure of a full show.',
    ],
    bullets: [
      'Improv fundamentals and ensemble play',
      'Scene work you can take to the mic',
      'Welcoming for beginners and returning performers',
    ],
  },
  {
    id: 'seniors-standup',
    eyebrow: 'Community Workshops',
    title: 'Seniors Stand up',
    accent: '#f5a623',
    image: LB_MEDIA.sunnyImprovWorkshop,
    lead: 'Your stories already have punchlines. We help you put them on stage.',
    body: [
      'Seniors Stand up Workshops invite older adults in our community to turn life experience into standup — family, immigration, culture clashes, and everything in between — in a supportive, age-friendly room.',
      'Sessions focus on finding your voice, shaping a short set, and building confidence to share it. No prior comedy experience required — just curiosity and a willingness to laugh at the journey.',
    ],
    bullets: [
      'Storytelling and joke structure for beginners',
      'A respectful, encouraging workshop environment',
      'Optional paths toward community showcases',
    ],
  },
] as const

function YouTubeEmbed({ videoId, title }: { videoId: string; title: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#2a1a0e] bg-[#0d0a07]">
      <div className="relative aspect-video w-full">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  )
}

export default function WorkshopsPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LB_MEDIA.improvWorkshop.src}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0d0a07] via-[#0d0a07]/92 to-[#0d0a07]/75" />
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
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-4">Learn · Play · Perform</p>
            <h1 className="text-5xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              Workshops
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">
              Hands-on rooms for South Asian creatives and community members — from improv play to seniors
              finding their standup voice.
            </p>
            <div className="flex flex-wrap gap-3">
              {SECTIONS.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#3a2a18] text-[#c8a882] text-sm font-bold hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
                >
                  {section.eyebrow === 'Creativity Workshops' ? 'Creativity (Improv)' : 'Seniors Stand up'}
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Sections */}
      {SECTIONS.map((section, index) => (
        <section
          key={section.id}
          id={section.id}
          className={`scroll-mt-24 mx-auto max-w-6xl px-5 py-16 ${
            index > 0 ? 'border-t border-[#2a1a0e]' : ''
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className={index % 2 === 1 ? 'lg:order-2' : undefined}>
              <p className="text-xs font-bold uppercase tracking-[0.2em] mb-3" style={{ color: section.accent }}>
                {section.eyebrow}
              </p>
              <h2 className="text-3xl md:text-4xl font-black text-[#e8d9c4] mb-4" style={serif}>
                {section.title}
              </h2>
              <p className="text-[#c8a882] text-lg leading-relaxed mb-5">{section.lead}</p>
              <div className="space-y-4 mb-6">
                {section.body.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)} className="text-[#6b5030] leading-relaxed">
                    {paragraph}
                  </p>
                ))}
              </div>
              <ul className="space-y-2 mb-8">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="flex gap-2.5 text-sm text-[#8a6a4a]">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: section.accent }} />
                    {bullet}
                  </li>
                ))}
              </ul>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-opacity hover:opacity-90"
                style={{
                  background: section.accent,
                  color: section.accent === '#f5a623' ? '#0d0a07' : '#ffffff',
                }}
              >
                Join to Get Notified
              </Link>
            </div>

            <div className={index % 2 === 1 ? 'lg:order-1' : undefined}>
              <div className="overflow-hidden rounded-2xl border border-[#2a1a0e] bg-[#120c06]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={section.image.src}
                  alt={section.image.alt}
                  className="w-full aspect-[4/3] object-cover"
                />
              </div>
            </div>
          </div>

          {section.id === 'seniors-standup' && (
            <div className="mt-14">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: section.accent }}>
                    From the Stage
                  </p>
                  <h3 className="text-2xl md:text-3xl font-black text-[#e8d9c4]" style={serif}>
                    Golden Age of Laughter
                  </h3>
                  <p className="text-[#6b5030] text-sm mt-2 max-w-xl">
                    Watch seniors from our workshops take the mic — real sets from Laal Button&apos;s senior standup showcases.
                  </p>
                </div>
                <a
                  href={SENIORS_PLAYLIST_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-sm font-bold hover:underline"
                  style={{ color: section.accent }}
                >
                  Full playlist on YouTube ↗
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {SENIORS_VIDEOS.map((video) => (
                  <div key={video.id} className="space-y-2.5">
                    <YouTubeEmbed
                      videoId={video.id}
                      title={`${video.title} — ${video.performer}`}
                    />
                    <div className="px-0.5">
                      <p className="text-sm font-bold text-[#e8d9c4] leading-snug">{video.performer}</p>
                      <p className="text-xs text-[#6b5030] mt-0.5">{video.title}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      ))}

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] px-8 py-12 text-center">
          <h2 className="text-2xl md:text-3xl font-black text-[#e8d9c4] mb-3" style={serif}>
            Want the next workshop date?
          </h2>
          <p className="text-[#6b5030] text-sm mb-6 max-w-md mx-auto">
            Create a free account on the One Mic Stand app to hear about upcoming improv and seniors standup sessions.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c41e3a] text-white font-bold text-sm hover:bg-[#a01830] transition-colors"
            >
              Create Free Account
            </Link>
            <Link
              href="/events"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
            >
              Browse Events
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');
      `}</style>
    </>
  )
}
