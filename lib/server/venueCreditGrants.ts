import type { SupabaseClient } from '@supabase/supabase-js'

export type ApplyVenueCreditsResult = {
  venueCreditsApplied: number
  creditsToDebit: number
}

/**
 * Apply venue-restricted credit passes (FIFO) before charging regular credits.
 * Mutates venue_credit_grants rows.
 */
export async function applyVenueCreditGrants(
  supabase: SupabaseClient,
  userId: string,
  venueId: string | null | undefined,
  creditsNeeded: number,
): Promise<ApplyVenueCreditsResult> {
  const needed = Math.max(0, Math.floor(creditsNeeded))
  if (needed <= 0 || !venueId) {
    return { venueCreditsApplied: 0, creditsToDebit: needed }
  }

  const now = new Date().toISOString()
  const { data: activeGrants } = await supabase
    .from('venue_credit_grants')
    .select('id, credits_remaining')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .gt('credits_remaining', 0)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('issued_at', { ascending: true })

  let venueCreditsApplied = 0
  let remaining = needed

  for (const grant of activeGrants || []) {
    if (remaining <= 0) break
    const balance = Math.max(0, Number(grant.credits_remaining) || 0)
    const use = Math.min(balance, remaining)
    if (use <= 0) continue
    const { error } = await supabase
      .from('venue_credit_grants')
      .update({ credits_remaining: balance - use })
      .eq('id', grant.id as string)
    if (error) {
      console.warn('applyVenueCreditGrants update failed:', grant.id, error.message)
      continue
    }
    venueCreditsApplied += use
    remaining -= use
  }

  return { venueCreditsApplied, creditsToDebit: remaining }
}
