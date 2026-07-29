/** IANA timezone for Toronto / GTA event times. */
export const CALENDAR_TZ = 'America/Toronto'

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000

export type CalendarEventInput = {
  title: string
  description?: string | null
  startDate: string | Date
  endDate?: string | Date | null
  location?: unknown
  eventId?: string
  eventUrl?: string
}

export function formatCalendarLocation(location: unknown): string {
  if (!location) return ''
  if (typeof location === 'string') return location
  if (typeof location === 'object' && location !== null) {
    const v = location as { name?: string; address?: string; pathname?: string }
    if (v.name && v.address) return `${v.name}, ${v.address}`
    if (v.name) return v.name
    if (v.address) return v.address
    if (v.pathname) return v.pathname
  }
  return ''
}

function resolveStartDate(startDate: string | Date): Date {
  return typeof startDate === 'string' ? new Date(startDate) : startDate
}

/** Combine time-only end_time values with the event date (matches cal API behavior). */
function resolveEndDate(start: Date, endDate?: string | Date | null, startDateRaw?: string): Date {
  if (endDate) {
    if (typeof endDate === 'string' && !endDate.includes('T') && startDateRaw) {
      const datePart = startDateRaw.split('T')[0]
      return new Date(`${datePart}T${endDate}`)
    }
    const parsed = typeof endDate === 'string' ? new Date(endDate) : endDate
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return new Date(start.getTime() + DEFAULT_DURATION_MS)
}

function formatLocalCalendarDateTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '00'

  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`
}

function formatUtcIcsDateTime(date: Date): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const h = String(date.getUTCHours()).padStart(2, '0')
  const min = String(date.getUTCMinutes()).padStart(2, '0')
  const s = String(date.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${d}T${h}${min}${s}Z`
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function buildEventDetails(input: CalendarEventInput): string {
  const parts: string[] = []
  const desc = (input.description || '').trim()
  if (desc) parts.push(desc)

  const eventUrl = input.eventUrl || (input.eventId ? getCalendarEventUrl(input.eventId) : '')
  if (eventUrl) parts.push(`Event page: ${eventUrl}`)

  return parts.join('\n\n')
}

export function getCalendarEventUrl(eventId: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/events/${eventId}`
  }

  const base =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://app.laalbutton.com'

  return `${base.replace(/\/$/, '')}/events/${eventId}`
}

export function buildGoogleCalendarUrl(input: CalendarEventInput): string {
  const startRaw = typeof input.startDate === 'string' ? input.startDate : input.startDate.toISOString()
  const start = resolveStartDate(input.startDate)
  const end = resolveEndDate(start, input.endDate, startRaw)
  const location = formatCalendarLocation(input.location)
  const details = buildEventDetails(input)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: input.title,
    dates: `${formatLocalCalendarDateTime(start, CALENDAR_TZ)}/${formatLocalCalendarDateTime(end, CALENDAR_TZ)}`,
    ctz: CALENDAR_TZ,
  })

  if (location) params.set('location', location)
  if (details) params.set('details', details)

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildIcsContent(input: CalendarEventInput): string {
  const startRaw = typeof input.startDate === 'string' ? input.startDate : input.startDate.toISOString()
  const start = resolveStartDate(input.startDate)
  const end = resolveEndDate(start, input.endDate, startRaw)
  const location = formatCalendarLocation(input.location)
  const details = buildEventDetails(input)
  const eventUrl = input.eventUrl || (input.eventId ? getCalendarEventUrl(input.eventId) : '')
  const uid = input.eventId
    ? `event-${input.eventId}@laalbutton.com`
    : `event-${start.getTime()}@laalbutton.com`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Laal Button//Event Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtcIcsDateTime(new Date())}`,
    `DTSTART;TZID=${CALENDAR_TZ}:${formatLocalCalendarDateTime(start, CALENDAR_TZ)}`,
    `DTEND;TZID=${CALENDAR_TZ}:${formatLocalCalendarDateTime(end, CALENDAR_TZ)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
  ]

  if (details) lines.push(`DESCRIPTION:${escapeIcsText(details)}`)
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`)
  if (eventUrl) lines.push(`URL:${eventUrl}`)

  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.join('\r\n')
}

export function buildIcsBlobUrl(input: CalendarEventInput): string {
  const content = buildIcsContent(input)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  return URL.createObjectURL(blob)
}

export function sanitizeIcsFilename(title: string): string {
  const cleaned = title.replace(/[^\w\s-]/g, '').trim().slice(0, 50)
  return cleaned || 'event'
}
