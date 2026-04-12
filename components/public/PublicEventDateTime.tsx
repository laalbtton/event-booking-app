'use client'

import { useEffect, useState } from 'react'

/**
 * Formats event start (and optional end) in the visitor's local timezone.
 * Used on the public event layout so times match PublicEventCard.
 *
 * Formatting runs only after mount (useEffect) so we never rely on SSR `toLocale*`
 * output (Node/Vercel is often UTC). Some mobile browsers also kept mismatched
 * server text when using suppressHydrationWarning alone.
 */
type Props = {
  startIso: string
  endIso?: string | null
}

function formatEventDateLong(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventTime(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
}

function buildLabel(startIso: string, endIso?: string | null): string {
  const datePart = formatEventDateLong(startIso)
  const startT = formatEventTime(startIso)
  const endT = endIso ? formatEventTime(endIso) : null
  return `${datePart} · ${startT}${endT ? ` – ${endT}` : ''}`
}

export function PublicEventDateTime({ startIso, endIso }: Props) {
  const [label, setLabel] = useState('')

  useEffect(() => {
    setLabel(buildLabel(startIso, endIso))
  }, [startIso, endIso])

  if (!label) {
    return (
      <span className="inline-block min-h-[1.35em] min-w-[10ch] text-stone-500" aria-busy="true">
        …
      </span>
    )
  }

  return <span>{label}</span>
}
