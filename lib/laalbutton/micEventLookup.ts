import { listPublicEvents, type PublicEventDetails } from '@/lib/server/publicContent'
import { isRyansChaiVenue, isWeekdayInToronto } from '@/lib/eventPosterDefaults'

const TORONTO_TZ = 'America/Toronto'

export function formatEventTimeInToronto(isoDate: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TZ,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(isoDate))
}

export function formatEventDateInToronto(isoDate: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TORONTO_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(isoDate))
}

function isTorontoEvent(event: PublicEventDetails): boolean {
  const venueName = event.venue?.name?.toLowerCase() ?? ''
  const city = event.venue?.city?.toLowerCase() ?? ''
  const location = event.locationText.toLowerCase()
  const title = event.title.toLowerCase()
  return (
    city.includes('toronto') ||
    location.includes('toronto') ||
    venueName.includes('toronto') ||
    title.includes('toronto')
  )
}

/** Next upcoming Wednesday open mic at Ryan's Chai in Brampton. */
export async function findNextBramptonOpenMicEvent(): Promise<PublicEventDetails | null> {
  const now = new Date()
  const events = await listPublicEvents(60, { upcomingOnly: true })

  return (
    events.find((event) => {
      if (event.isCancelled) return false
      if (new Date(event.startDate) < now) return false
      if (!isWeekdayInToronto(event.startDate, 'Wednesday')) return false
      return isRyansChaiVenue(event.venue?.name ?? '', event.locationText)
    }) ?? null
  )
}

/** Next upcoming Tuesday open mic in Toronto (venue-agnostic). */
export async function findNextTorontoOpenMicEvent(): Promise<PublicEventDetails | null> {
  const now = new Date()
  const events = await listPublicEvents(60, { upcomingOnly: true })

  return (
    events.find((event) => {
      if (event.isCancelled) return false
      if (new Date(event.startDate) < now) return false
      if (!isWeekdayInToronto(event.startDate, 'Tuesday')) return false
      return isTorontoEvent(event)
    }) ?? null
  )
}
