import {
  listPublicEvents,
  sortPublicEventsForListing,
  type PublicEventDetails,
} from '@/lib/server/publicContent'

/** Slugs for Laal Button marketing series pages under /laalbutton/. */
export type LaalButtonSeriesSlug =
  | 'roti-kapda-aur-comedy'
  | 'punjabis-in-tech'
  | 'immigrants-with-attitude'

type SeriesMatchConfig = {
  /** Phrases matched against normalized event title (case-insensitive, punctuation ignored). */
  titlePhrases: string[]
  /** Optional community slug(s) from event_communities (exact, case-insensitive). */
  communitySlugs?: string[]
  /** Optional phrases matched against primary community name. */
  communityPhrases?: string[]
}

/**
 * Match keywords per Laal Button marketing series page.
 * Add entries here when creating new series landing pages with an Upcoming Events section.
 */
export const LAAL_BUTTON_SERIES_MATCH: Record<LaalButtonSeriesSlug, SeriesMatchConfig> = {
  'roti-kapda-aur-comedy': {
    titlePhrases: ['roti kapda aur comedy', 'roti kapda', 'rkac'],
  },
  'punjabis-in-tech': {
    titlePhrases: ['punjabis in tech', 'punjabi in tech', 'punjabisintech'],
  },
  'immigrants-with-attitude': {
    titlePhrases: ['immigrants with attitude', 'immigrant with attitude'],
  },
}

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function eventMatchesLaalButtonSeries(
  event: PublicEventDetails,
  series: LaalButtonSeriesSlug,
): boolean {
  const config = LAAL_BUTTON_SERIES_MATCH[series]
  const title = normalizeForMatch(event.title)

  if (config.titlePhrases.some((phrase) => title.includes(normalizeForMatch(phrase)))) {
    return true
  }

  if (config.communitySlugs?.length && event.communitySlug) {
    const slug = event.communitySlug.toLowerCase()
    if (config.communitySlugs.some((s) => s.toLowerCase() === slug)) return true
  }

  if (config.communityPhrases?.length && event.communityName) {
    const community = normalizeForMatch(event.communityName)
    if (config.communityPhrases.some((phrase) => community.includes(normalizeForMatch(phrase)))) {
      return true
    }
  }

  return false
}

/** Upcoming public events that belong to a Laal Button marketing series. */
export async function listUpcomingSeriesEvents(
  series: LaalButtonSeriesSlug,
  limit = 10,
): Promise<PublicEventDetails[]> {
  const events = await listPublicEvents(60, { upcomingOnly: true })
  const matched = events.filter(
    (event) => !event.isCancelled && eventMatchesLaalButtonSeries(event, series),
  )
  return sortPublicEventsForListing(matched).slice(0, limit)
}
