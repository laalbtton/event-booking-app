'use client'

/**
 * Formats event start (and optional end) in the visitor's local timezone.
 * Used on the public event layout so times match PublicEventCard (client-rendered).
 * Server-only toLocale* calls use the host TZ (often UTC on Vercel), which skews wall-clock times.
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

export function PublicEventDateTime({ startIso, endIso }: Props) {
  const datePart = formatEventDateLong(startIso)
  const startT = formatEventTime(startIso)
  const endT = endIso ? formatEventTime(endIso) : null
  return (
    <span suppressHydrationWarning>
      {datePart} · {startT}
      {endT ? ` – ${endT}` : ''}
    </span>
  )
}
