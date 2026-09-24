/** IANA timezone for Toronto / Eastern US (handles EST and EDT). */
export const EASTERN_TZ = 'America/New_York'

/**
 * Calendar date YYYY-MM-DD in Eastern time (for queries / digest windows).
 */
export function getEasternCalendarDateString(d: string | Date = new Date()): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

/**
 * Add calendar days to a YYYY-MM-DD string (UTC date math; stable for event date ranges).
 */
export function addCalendarDaysToYmd(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const jd = new Date(Date.UTC(y, m - 1, d))
  jd.setUTCDate(jd.getUTCDate() + deltaDays)
  const yy = jd.getUTCFullYear()
  const mm = String(jd.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(jd.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/**
 * Format date + time in Eastern Time — for server-sent emails (Vercel is UTC; avoids wrong local time).
 * Example: "Wed, Jan 15, 2025 at 2:30 PM ET"
 */
export function formatDateTimeEastern(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: EASTERN_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${dateStr} at ${timeStr} ET`
}

/**
 * Long weekday + date, and time, for digest-style cards (matches public card style, fixed to Eastern).
 */
export function formatDigestEventDatePartsEastern(date: string | Date): { dateLine: string; timeLine: string } {
  const d = typeof date === 'string' ? new Date(date) : date
  return {
    dateLine: d.toLocaleDateString('en-CA', {
      timeZone: EASTERN_TZ,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
    timeLine: d.toLocaleTimeString('en-CA', {
      timeZone: EASTERN_TZ,
      hour: 'numeric',
      minute: '2-digit',
    }),
  }
}

/**
 * Format date with day of week and time (without seconds).
 * Always Eastern — UTC servers otherwise shift evening shows to the next weekday.
 * Example: "Wed, Jan 15, 2025 at 2:30 PM"
 */
export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const dateStr = d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const timeStr = d.toLocaleTimeString('en-US', {
    timeZone: EASTERN_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${dateStr} at ${timeStr}`
}

/**
 * Format date with day of week (without time).
 * Always Eastern so evening events keep the correct weekday.
 * Example: "Wed, Jan 15, 2025"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Format time only (without seconds). Always Eastern.
 * Example: "2:30 PM"
 */
export function formatTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-US', {
    timeZone: EASTERN_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/** "Wednesday, September 23" in Eastern — for day group headings. */
export function formatEventWeekdayDateEastern(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-CA', {
    timeZone: EASTERN_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

/** "Wed, Sep 23, 2026" in Eastern — for public event cards. */
export function formatEventDateCardEastern(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-CA', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** "8:00 p.m." in Eastern. */
export function formatEventTimeEastern(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleTimeString('en-CA', {
    timeZone: EASTERN_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** "September 23, 2026" in Eastern — for OG / WhatsApp / share titles. */
export function formatEventDateTitleEastern(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    timeZone: EASTERN_TZ,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const EASTERN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/** 0 = Sunday … 6 = Saturday, in Eastern. */
export function getEasternWeekdayIndex(d: string | Date = new Date()): number {
  const date = typeof d === 'string' ? new Date(d) : d
  const wd = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TZ,
    weekday: 'short',
  }).format(date)
  const idx = EASTERN_WEEKDAYS.indexOf(wd as (typeof EASTERN_WEEKDAYS)[number])
  return idx === -1 ? 0 : idx
}
