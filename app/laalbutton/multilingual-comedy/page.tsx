import type { Metadata } from 'next'
import Link from 'next/link'
import { MultilingualAccordion } from '@/components/laalbutton/MultilingualAccordion'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Multilingual Comedy Open Mics',
  description:
    'Weekly multilingual comedy open mics in Brampton (Wednesday) and Toronto (Thursday). Perform in Punjabi, Hindi, Urdu, or English — all stages welcome all languages.',
  openGraph: {
    title: 'Multilingual Comedy Open Mics | Laal Button Comedy',
    description: 'Weekly open mics in Brampton and Toronto. All languages welcome on stage.',
    url: 'https://laalbutton.com/laalbutton/multilingual-comedy',
  },
}

const serif = { fontFamily: "'DM Serif Display', Georgia, serif" } as const

export default function MultilingualComedyPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-[#2a1a0e]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(196,30,58,0.12) 0%, transparent 70%)',
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
            <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-4">Every Week</p>
            <h1 className="text-5xl md:text-6xl font-black leading-[0.95] text-[#e8d9c4] mb-5" style={serif}>
              Multilingual
              <br />
              <span className="text-[#f5a623]">Comedy</span>
              <br />
              Open Mics
            </h1>
            <p className="text-[#8a6a4a] text-lg leading-relaxed mb-8">
              Two weekly open mics where you can perform in any language. Wednesday in Brampton. Thursday in Toronto. All levels welcome — first-timer to seasoned performer.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href="#mic-nights"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#c41e3a] text-white font-bold text-sm hover:bg-[#a01830] transition-colors"
              >
                See Both Mics
              </a>
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-[#3a2a18] text-[#c8a882] font-bold text-sm hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
              >
                Join the App
              </Link>
            </div>
          </div>

          {/* Placeholder image */}
          <div className="mt-12 rounded-2xl border border-[#2a1a0e] bg-[#120c06] h-56 md:h-72 flex items-center justify-center">
            <div className="text-center space-y-2">
              <p className="text-5xl">🎤</p>
              <p className="text-[#3a2a18] text-sm">Event photo coming soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick facts */}
      <section className="mx-auto max-w-6xl px-5 py-10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { icon: '🗓', label: 'Wednesday & Thursday', sub: 'Two weekly mics' },
            { icon: '📍', label: 'Brampton & Toronto', sub: 'Your city, your stage' },
            { icon: '🌐', label: 'All Languages Welcome', sub: 'Punjabi, Hindi, Urdu, English & more' },
          ].map((fact) => (
            <div key={fact.label} className="rounded-xl border border-[#2a1a0e] bg-[#120c06] px-6 py-5 text-center">
              <p className="text-3xl mb-2">{fact.icon}</p>
              <p className="text-[#c8a882] font-bold text-sm">{fact.label}</p>
              <p className="text-[#4a3520] text-xs mt-0.5">{fact.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Accordion section */}
      <section id="mic-nights" className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
        <div className="mb-8">
          <p className="text-[#c41e3a] text-xs font-bold uppercase tracking-[0.2em] mb-2">The Mics</p>
          <h2 className="text-3xl font-black text-[#e8d9c4]" style={serif}>
            Two cities. One community.
          </h2>
        </div>

        <MultilingualAccordion />
      </section>

      {/* Perform / Attend */}
      <section className="mx-auto max-w-6xl px-5 py-10 border-t border-[#2a1a0e]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-7">
            <p className="text-2xl mb-3">🎙️</p>
            <h3 className="font-black text-[#e8d9c4] text-lg mb-2" style={serif}>I want to perform</h3>
            <p className="text-[#6b5030] text-sm leading-relaxed mb-4">
              Sign up as a performer on the app, book your spot, and show up with your material. All experience levels welcome. Show up in your language.
            </p>
            <Link
              href="/signup?role=performer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#c41e3a] text-white text-sm font-bold hover:bg-[#a01830] transition-colors"
            >
              Sign Up as Performer
            </Link>
          </div>
          <div className="rounded-2xl border border-[#2a1a0e] bg-[#120c06] p-7">
            <p className="text-2xl mb-3">👏</p>
            <h3 className="font-black text-[#e8d9c4] text-lg mb-2" style={serif}>I want to attend</h3>
            <p className="text-[#6b5030] text-sm leading-relaxed mb-4">
              The best open mics have great audiences. Come out, support the comedians, and be part of something being built from the ground up.
            </p>
            <Link
              href="/signup?role=audience"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-[#3a2a18] text-[#c8a882] text-sm font-bold hover:border-[#c41e3a]/40 hover:text-[#f5a623] transition-colors"
            >
              Sign Up as Audience
            </Link>
          </div>
        </div>
      </section>

      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&display=swap');`}</style>
    </>
  )
}
