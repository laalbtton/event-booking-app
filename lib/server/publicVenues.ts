import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { getPublicServerClient } from '@/lib/server/supabasePublic'
import { isVenueUuid } from '@/lib/venuePaths'

// Venues RLS is TO authenticated, so we use the admin client (bypasses RLS)
// to make the list available on the public communities/spaces page.
function getVenueClient() {
  return getAdminClient() ?? getPublicServerClient()
}

export type PublicVenue = {
  id: string
  slug: string | null
  name: string
  address: string
  city: string | null
  region: string | null
  country: string | null
  description: string | null
  google_review_url: string | null
  website_url: string | null
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  drinks_available: boolean
  upcomingEventCount: number
}

/**
 * Returns all approved venues, each with a count of upcoming active events.
 * Venues are sorted: those with upcoming events first (active), then the rest (inactive).
 */
export async function listPublicVenues(): Promise<PublicVenue[]> {
  const supabase = getVenueClient()
  if (!supabase) return []

  // Fetch all venues and upcoming active events in parallel.
  const now = new Date().toISOString()

  const [venueRes, eventRes] = await Promise.all([
    supabase
      .from('venues')
      .select(
        'id, slug, name, address, city, region, country, description, google_review_url, website_url, parking_options, accessibility, food_drinks_available, drinks_available',
      )
      .order('name', { ascending: true }),
    supabase
      .from('events')
      .select('venue_id, date, status')
      .not('venue_id', 'is', null)
      .gte('date', now)
      .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")'),
  ])

  const venues = (venueRes.data ?? []) as Array<{
    id: string
    slug: string | null
    name: string
    address: string
    city: string | null
    region: string | null
    country: string | null
    description: string | null
    google_review_url: string | null
    website_url: string | null
    parking_options: string | null
    accessibility: string | null
    food_drinks_available: boolean
    drinks_available: boolean
  }>

  const upcomingCounts = new Map<string, number>()
  ;((eventRes.data ?? []) as Array<{ venue_id: string; date: string; status: string | null }>).forEach(
    (row) => {
      upcomingCounts.set(row.venue_id, (upcomingCounts.get(row.venue_id) ?? 0) + 1)
    },
  )

  const result: PublicVenue[] = venues.map((v) => ({
    id: v.id,
    slug: v.slug,
    name: v.name,
    address: v.address,
    city: v.city,
    region: v.region,
    country: v.country,
    description: v.description,
    google_review_url: v.google_review_url,
    website_url: v.website_url,
    parking_options: v.parking_options,
    accessibility: v.accessibility,
    food_drinks_available: v.food_drinks_available ?? false,
    drinks_available: v.drinks_available ?? false,
    upcomingEventCount: upcomingCounts.get(v.id) ?? 0,
  }))

  // Active venues (≥1 upcoming event) first, then inactive, both alphabetically.
  result.sort((a, b) => {
    const aActive = a.upcomingEventCount > 0 ? 0 : 1
    const bActive = b.upcomingEventCount > 0 ? 0 : 1
    if (aActive !== bActive) return aActive - bActive
    return a.name.localeCompare(b.name)
  })

  return result
}

export async function getPublicVenue(idOrSlug: string): Promise<PublicVenue | null> {
  const supabase = getVenueClient()
  if (!supabase) return null

  let query = supabase
    .from('venues')
    .select(
      'id, slug, name, address, city, region, country, description, google_review_url, website_url, parking_options, accessibility, food_drinks_available, drinks_available',
    )

  query = isVenueUuid(idOrSlug) ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug)

  const { data: venue } = await query.maybeSingle()
  if (!venue) return null

  const now = new Date().toISOString()
  const { count } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', (venue as { id: string }).id)
    .gte('date', now)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')

  const v = venue as {
    id: string
    slug: string | null
    name: string
    address: string
    city: string | null
    region: string | null
    country: string | null
    description: string | null
    google_review_url: string | null
    website_url: string | null
    parking_options: string | null
    accessibility: string | null
    food_drinks_available: boolean
    drinks_available: boolean
  }

  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    address: v.address,
    city: v.city,
    region: v.region,
    country: v.country,
    description: v.description,
    google_review_url: v.google_review_url,
    website_url: v.website_url,
    parking_options: v.parking_options,
    accessibility: v.accessibility,
    food_drinks_available: v.food_drinks_available ?? false,
    drinks_available: v.drinks_available ?? false,
    upcomingEventCount: count ?? 0,
  }
}
