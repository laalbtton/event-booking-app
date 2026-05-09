/**
 * Shared utilities for recurring event series.
 * This file is safe to import from both server and client code.
 */

export type RecurrenceType = 'weekly' | 'biweekly' | 'monthly_weekday'

export type SeriesRecurrenceFields = {
  recurrence_type: RecurrenceType
  day_of_week: number | null    // 0 (Sun) – 6 (Sat)
  week_of_month: number | null  // 1-4 or -1 (last)
  start_time_local: string      // 'HH:MM' or 'HH:MM:SS' Eastern
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const WEEK_ORDINALS = ['', '1st', '2nd', '3rd', '4th']

/**
 * Return a human-readable description of a recurrence rule.
 * Example: "Every Thursday at 8 PM ET"
 */
export function describeRecurrence(series: SeriesRecurrenceFields): string {
  const dayName = DAY_NAMES[series.day_of_week ?? 0] ?? 'day'
  const [hh, mm] = series.start_time_local.split(':')
  const h = parseInt(hh)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  const timeStr = mm === '00' ? `${h12} ${ampm}` : `${h12}:${mm} ${ampm}`

  if (series.recurrence_type === 'weekly') {
    return `Every ${dayName} at ${timeStr} ET`
  }
  if (series.recurrence_type === 'biweekly') {
    return `Every other ${dayName} at ${timeStr} ET`
  }
  // monthly_weekday
  const wom = series.week_of_month ?? 1
  const ordinal = wom === -1 ? 'last' : (WEEK_ORDINALS[wom] ?? `${wom}th`)
  return `Every ${ordinal} ${dayName} of the month at ${timeStr} ET`
}
