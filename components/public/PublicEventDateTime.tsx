'use client'

import { EASTERN_TZ, formatEventTimeEastern } from '@/lib/dateUtils'

/**
 * Formats event start (and optional end) in Eastern time so evening shows
 * keep the correct weekday (Vercel/Node is UTC).
 */
type Props = {
  startIso: string
  endIso?: string | null
}

function formatEventDateLong(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleDateString('en-CA', {
    timeZone: EASTERN_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function buildLabel(startIso: string, endIso?: string | null): string {
  const datePart = formatEventDateLong(startIso)
  const startT = formatEventTimeEastern(startIso)
  const endT = endIso ? formatEventTimeEastern(endIso) : null
  return `${datePart} · ${startT}${endT ? ` – ${endT}` : ''}`
}

export function PublicEventDateTime({ startIso, endIso }: Props) {
  return <span>{buildLabel(startIso, endIso)}</span>
}
