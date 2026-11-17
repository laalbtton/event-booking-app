const TORONTO_TZ = 'America/Toronto'

export const BRAMPTON_OPEN_MIC_DEFAULT_POSTER = '/images/WedBramptonOpenMic.png'
export const TORONTO_OPEN_MIC_DEFAULT_POSTER = '/images/Tuesdays.png'

type VenueLike = {
  name: string
  city?: string
} | null

export function isWeekdayInToronto(
  isoDate: string,
  weekday: 'Tuesday' | 'Wednesday' | 'Thursday',
): boolean {
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

function mentionsBrampton(args: {
  locationText: string
  venue: VenueLike
  title?: string | null
}): boolean {
  const city = (args.venue?.city ?? '').toLowerCase()
  const venueName = (args.venue?.name ?? '').toLowerCase()
  const location = args.locationText.toLowerCase()
  const title = (args.title ?? '').toLowerCase()
  return (
    city.includes('brampton') ||
    location.includes('brampton') ||
    venueName.includes('brampton') ||
    title.includes('brampton')
  )
}

/** Wednesday events in Brampton (any venue). Ryan's Chai still counts even if city is missing. */
export function isBramptonWednesdayEvent(args: {
  startDate: string
  locationText: string
  venue: VenueLike
  title?: string | null
}): boolean {
  if (!isWeekdayInToronto(args.startDate, 'Wednesday')) return false
  if (mentionsBrampton(args)) return true
  return isRyansChaiVenue(args.venue?.name ?? '', args.locationText)
}

/** @deprecated Use isBramptonWednesdayEvent — kept so older imports keep working. */
export function isBramptonRyansChaiWednesdayEvent(args: {
  startDate: string
  locationText: string
  venue: VenueLike
  title?: string | null
}): boolean {
  return isBramptonWednesdayEvent(args)
}

function mentionsToronto(args: {
  locationText: string
  venue: VenueLike
  title?: string | null
}): boolean {
  const city = (args.venue?.city ?? '').toLowerCase()
  const venueName = (args.venue?.name ?? '').toLowerCase()
  const location = args.locationText.toLowerCase()
  const title = (args.title ?? '').toLowerCase()
  return (
    city.includes('toronto') ||
    location.includes('toronto') ||
    venueName.includes('toronto') ||
    title.includes('toronto')
  )
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

/** Tuesday Toronto open mic — venue-agnostic so a venue change still gets the poster. */
export function isTuesdayTorontoOpenMicEvent(args: {
  startDate: string
  locationText: string
  venue: VenueLike
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): boolean {
  if (!isWeekdayInToronto(args.startDate, 'Tuesday')) return false
  if (mentionsBrampton(args)) return false
  if (mentionsToronto(args)) return true
  return isComedyOpenMicEvent(args)
}

/** @deprecated Toronto mic moved to Tuesday. */
export function isThursdayComedyOpenMicEvent(args: {
  startDate: string
  locationText?: string
  venue?: VenueLike
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): boolean {
  return isTuesdayTorontoOpenMicEvent({
    startDate: args.startDate,
    locationText: args.locationText ?? '',
    venue: args.venue ?? null,
    eventType: args.eventType,
    openMicType: args.openMicType,
    title: args.title,
  })
}

/**
 * Default poster for event listings (public site + app) when no custom poster
 * is uploaded. Same rules as the Brampton / Toronto marketing pages:
 *   - Wednesday Brampton event → WedBramptonOpenMic.png
 *   - Tuesday Toronto open mic → Tuesdays.png
 */
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

  if (isBramptonWednesdayEvent(args)) {
    return BRAMPTON_OPEN_MIC_DEFAULT_POSTER
  }

  if (isTuesdayTorontoOpenMicEvent(args)) {
    return TORONTO_OPEN_MIC_DEFAULT_POSTER
  }

  return null
}

/** Alias used by the app UI — same resolution rules as the public website. */
export const resolveEventDisplayPosterUrl = resolvePublicEventPosterUrl

/**
 * Email clients need absolute image URLs. Relative paths like
 * `/images/OpenMicToronto.png` are turned into `${baseUrl}/images/...`.
 */
export function absolutizePosterUrl(
  url: string | null | undefined,
  baseUrl: string,
): string | null {
  const trimmed = url?.trim()
  if (!trimmed) return null
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const base = baseUrl.replace(/\/$/, '')
  return trimmed.startsWith('/') ? `${base}${trimmed}` : `${base}/${trimmed}`
}
