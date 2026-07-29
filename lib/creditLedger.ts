/**
 * Credit ledger: purchased vs complimentary credits.
 * - Purchased: from Stripe (1 credit = $1)
 * - Complimentary: manual add, welcome invite, etc.
 * - Consumption: use purchased first, then complimentary.
 */

export type CreditSplit = {
  purchasedUsed: number
  complimentaryUsed: number
}

export type CreditBalanceProfile = {
  credits?: number | null
  credits_purchased?: number | null
  credits_complimentary?: number | null
}

/**
 * Resolve purchased/complimentary balances for debits.
 * When `credits` exceeds the ledger split (legacy refunds / pre-ledger rows),
 * treat the gap as complimentary so spendable balance matches the profile total.
 */
export function getEffectiveCreditBalances(profile: CreditBalanceProfile): {
  purchased: number
  complimentary: number
} {
  const purchased = Math.max(0, Number(profile.credits_purchased) || 0)
  let complimentary = Math.max(0, Number(profile.credits_complimentary) || 0)
  const ledgerTotal = purchased + complimentary
  const legacyTotal = Math.max(0, Number(profile.credits) || 0)
  if (legacyTotal > ledgerTotal) {
    complimentary += legacyTotal - ledgerTotal
  }
  return { purchased, complimentary }
}

/** Regular (non-venue) credits available for booking — matches server debit logic. */
export function getSpendableRegularCredits(profile: CreditBalanceProfile): number {
  const { purchased, complimentary } = getEffectiveCreditBalances(profile)
  return purchased + complimentary
}

/**
 * Compute how to split a deduction: use purchased credits first, then complimentary.
 */
export function splitDeduction(
  purchasedBalance: number,
  complimentaryBalance: number,
  amount: number
): CreditSplit {
  const p = Math.max(0, Number(purchasedBalance) || 0)
  const c = Math.max(0, Number(complimentaryBalance) || 0)
  const amt = Math.max(0, Math.floor(amount))
  const purchasedUsed = Math.min(p, amt)
  const complimentaryUsed = amt - purchasedUsed
  return { purchasedUsed, complimentaryUsed }
}

/**
 * Check if user has enough total credits.
 */
export function hasEnoughCredits(
  purchasedBalance: number,
  complimentaryBalance: number,
  amount: number
): boolean {
  const total = (purchasedBalance || 0) + (complimentaryBalance || 0)
  return total >= amount
}
