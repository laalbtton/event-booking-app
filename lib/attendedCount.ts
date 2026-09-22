/**
 * Shared "events attended" counting.
 *
 * Hosts and event creators are usually not marked `attendance_status = 'attended'`
 * (they take attendance for others, and admin/series create paths often skip a
 * booking entirely). Performer bookings also default to attended when status is
 * null. Audience still requires an explicit check-in.
 */

export const EXCLUDED_EVENT_STATUSES = new Set([
  'cancelled',
  'draft',
  'private',
  'pending_approval',
])

export const ABSENT_ATTENDANCE = new Set(['not_present', 'no_show'])

export type AttendedCountEvent = {
  id?: string | null
  date?: string | null
  end_time?: string | null
  status?: string | null
}

export type AttendedCountBooking = {
  event_id?: string | null
  status?: string | null
  booking_scope?: string | null
  attendance_status?: string | null
  events?: AttendedCountEvent | AttendedCountEvent[] | null
}

export function unwrapBookingEvent(
  events: AttendedCountBooking['events'],
): AttendedCountEvent | null {
  if (!events) return null
  return Array.isArray(events) ? events[0] ?? null : events
}

export function eventIsCountable(event: AttendedCountEvent | null | undefined): boolean {
  if (!event) return false
  const status = String(event.status || 'active')
  return !EXCLUDED_EVENT_STATUSES.has(status)
}

export function eventHasEnded(
  event: AttendedCountEvent | null | undefined,
  now = new Date(),
): boolean {
  if (!event) return false
  const end = event.end_time || event.date
  if (!end) return false
  const endMs = new Date(end).getTime()
  return Number.isFinite(endMs) && endMs <= now.getTime()
}

export function bookingCountsAsAttended(
  booking: AttendedCountBooking,
  now = new Date(),
): boolean {
  if (booking.status !== 'confirmed') return false
  const event = unwrapBookingEvent(booking.events)
  if (!eventIsCountable(event) || !eventHasEnded(event, now)) return false
  const attendance = booking.attendance_status
  if (attendance && ABSENT_ATTENDANCE.has(attendance)) return false
  if (booking.booking_scope === 'audience') return attendance === 'attended'
  // Performer / host / legacy rows: null means attended by default.
  return attendance === 'attended' || attendance == null
}

export function hostedEventCountsAsAttended(
  event: AttendedCountEvent,
  now = new Date(),
): boolean {
  return Boolean(event.id) && eventIsCountable(event) && eventHasEnded(event, now)
}

export function countAttendedEvents(input: {
  bookings?: AttendedCountBooking[] | null
  hostedEvents?: AttendedCountEvent[] | null
  now?: Date
}): number {
  const now = input.now ?? new Date()
  const ids = new Set<string>()

  for (const event of input.hostedEvents || []) {
    if (hostedEventCountsAsAttended(event, now) && event.id) {
      ids.add(event.id)
    }
  }

  for (const booking of input.bookings || []) {
    if (!bookingCountsAsAttended(booking, now)) continue
    const event = unwrapBookingEvent(booking.events)
    const id = event?.id || booking.event_id
    if (id) ids.add(id)
  }

  return ids.size
}
