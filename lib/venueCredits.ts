export type VenueCreditGrant = {
  venue_id: string
  credits_remaining: number
}

/** Sum of active venue pass credits for a specific venue. */
export function venueCreditsForEvent(
  grants: VenueCreditGrant[],
  venueId: string | null | undefined,
): number {
  if (!venueId) return 0
  return grants
    .filter((g) => g.venue_id === venueId)
    .reduce((sum, g) => sum + Math.max(0, Number(g.credits_remaining) || 0), 0)
}

/**
 * Whether the user can cover a booking cost using venue passes (for that venue) plus regular credits.
 * Mirrors server logic in /api/bookings/create (venue grants FIFO, then profile credits).
 */
export function canAffordWithVenueCredits(
  regularCredits: number,
  grants: VenueCreditGrant[],
  venueId: string | null | undefined,
  creditsRequired: number,
): boolean {
  const required = Math.max(0, Math.floor(creditsRequired))
  if (required === 0) return true
  const venueCover = Math.min(venueCreditsForEvent(grants, venueId), required)
  const regularNeeded = required - venueCover
  return Math.max(0, Number(regularCredits) || 0) >= regularNeeded
}
