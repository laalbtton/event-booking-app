'use client'

import { useEffect, useRef, useState } from 'react'

type StatItem = {
  label: string
  value: number
  icon: string
}

function formatStat(value: number): string {
  if (value >= 1000) {
    const thousands = value / 1000
    const rounded = thousands >= 100 ? Math.round(thousands) : Math.round(thousands * 10) / 10
    return `${rounded}k+`
  }
  return value.toLocaleString()
}

function CountUp({ target, durationMs = 1400 }: { target: number; durationMs?: number }) {
  const [display, setDisplay] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

    if (prefersReduced) {
      setDisplay(target)
      return
    }

    const runAnimation = () => {
      if (startedRef.current) return
      startedRef.current = true
      const start = performance.now()
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs)
        // easeOutCubic for a lively settle
        const eased = 1 - Math.pow(1 - progress, 3)
        setDisplay(Math.round(target * eased))
        if (progress < 1) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            runAnimation()
            observer.disconnect()
          }
        })
      },
      { threshold: 0.3 },
    )
    observer.observe(node)

    return () => observer.disconnect()
  }, [target, durationMs])

  return <span ref={ref}>{formatStat(display)}</span>
}

export function StatsBand({
  usersRegistered,
  eventsHosted,
  performerSlotsBooked,
}: {
  usersRegistered: number
  eventsHosted: number
  performerSlotsBooked: number
}) {
  const stats: StatItem[] = [
    { label: 'Members on the platform', value: usersRegistered, icon: '👥' },
    { label: 'Events hosted', value: eventsHosted, icon: '🎫' },
    { label: 'Performer spots booked', value: performerSlotsBooked, icon: '🎤' },
  ]

  // Hide the band entirely if there is genuinely nothing to show yet.
  const hasActivity = stats.some((s) => s.value > 0)
  if (!hasActivity) return null

  return (
    <section className="bg-zinc-950 text-white border-t border-white/5 px-4 py-12">
      <div className="max-w-5xl mx-auto">
        <p className="text-center text-sm uppercase tracking-widest text-stone-400 mb-8">
          The stage so far
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/5 px-6 py-8 text-center shadow-sm"
            >
              <div className="text-3xl mb-3" aria-hidden="true">
                {stat.icon}
              </div>
              <div className="text-4xl md:text-5xl font-bold text-yellow-400 tabular-nums">
                <CountUp target={stat.value} />
              </div>
              <div className="mt-2 text-sm text-stone-300">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
