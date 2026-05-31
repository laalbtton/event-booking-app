/** Matches Supabase / standard UUID v4. */
export const VENUE_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function venuePublicPath(venue: { id: string; slug?: string | null }): string {
  const segment = venue.slug?.trim() || venue.id
  return `/venues/${segment}`
}

export function isVenueUuid(value: string): boolean {
  return VENUE_UUID_RE.test(value)
}
