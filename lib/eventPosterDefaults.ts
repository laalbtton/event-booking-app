const TORONTO_TZ = 'America/Toronto'

export const BRAMPTON_OPEN_MIC_DEFAULT_POSTER = '/images/Brampton_Open_mic_generic.png'
export const TORONTO_OPEN_MIC_DEFAULT_POSTER = '/images/OpenMicToronto.png'

type VenueLike = {
  name: string
  city?: string
} | null

export function isWeekdayInToronto(isoDate: string, weekday: 'Wednesday' | 'Thursday'): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: TORONTO_TZ, weekday: 'long' }).format(
      new Date(isoDate),
    ) === weekday
  )
}

export function isRyansChaiVenue(venueName: string, locationText: string): boolean {
  const venue = venueName.toLowerCase()
  const location = locationText.toLowerCase()
  return (
    (venue.includes('ryan') && venue.includes('chai')) ||
    (location.includes('ryan') && location.includes('chai'))
  )
}

export function isBramptonRyansChaiWednesdayEvent(args: {
  startDate: string
  locationText: string
  venue: VenueLike
}): boolean {
  if (!isWeekdayInToronto(args.startDate, 'Wednesday')) return false
  const venueName = args.venue?.name ?? ''
  if (!isRyansChaiVenue(venueName, args.locationText)) return false

  const city = (args.venue?.city ?? '').toLowerCase()
  const location = args.locationText.toLowerCase()
  if (city.includes('brampton') || location.includes('brampton')) return true

  // Ryan's Chai is Brampton-only in this app — treat Wednesday Ryan's Chai as Brampton open mic.
  return true
}

function isComedyOpenMicEvent(args: {
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): boolean {
  const eventType = (args.eventType ?? '').toLowerCase()
  const openMicType = (args.openMicType ?? '').toLowerCase()
  const title = (args.title ?? '').toLowerCase()

  if (eventType === 'open_mic' || eventType.includes('open_mic')) return true
  if (openMicType) return true
  if (title.includes('open mic') || title.includes('open-mic')) return true
  return false
}

export function isThursdayComedyOpenMicEvent(args: {
  startDate: string
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): boolean {
  if (!isWeekdayInToronto(args.startDate, 'Thursday')) return false
  return isComedyOpenMicEvent(args)
}

/** Default poster for public listings when no custom poster is uploaded. */
export function resolvePublicEventPosterUrl(args: {
  posterUrl: string | null | undefined
  startDate: string
  locationText: string
  venue: VenueLike
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): string | null {
  const custom = args.posterUrl?.trim()
  if (custom) return custom

  if (isBramptonRyansChaiWednesdayEvent(args)) {
    return BRAMPTON_OPEN_MIC_DEFAULT_POSTER
  }

  if (isThursdayComedyOpenMicEvent(args)) {
    return TORONTO_OPEN_MIC_DEFAULT_POSTER
  }

  return null
}
