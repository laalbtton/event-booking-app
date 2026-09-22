export type AudienceBookingCreditEvent = {
  tickets_enabled?: boolean | null
  audience_deposit_credits?: number | null
  credits_required?: number | null
}

function nonNegativeNumber(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, parsed)
}

/**
 * Credits an audience member must hold to book, after any free pass is used.
 *
 * Never coerce 0 → 1. A stored deposit of 0 stays 0.
 * Non-ticketed events with credits_required <= 0 are free RSVPs even if the
 * column still has the leftover SQL default of 1.
 */
export function getAudienceBookingCreditsRequired(event: AudienceBookingCreditEvent): number {
  const deposit = nonNegativeNumber(event.audience_deposit_credits)
  const creditsRequired = nonNegativeNumber(event.credits_required)

  if (!event.tickets_enabled && creditsRequired <= 0) {
    return 0
  }

  if (event.tickets_enabled) {
    return Math.max(deposit, creditsRequired)
  }

  return deposit
}

export function getAudienceCreditsToDebit(
  event: AudienceBookingCreditEvent,
  freePassesRemaining: unknown,
): number {
  if (nonNegativeNumber(freePassesRemaining) > 0) return 0
  return getAudienceBookingCreditsRequired(event)
}
