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
 *
 * `profiles.credits` is authoritative: it is the column the booking flow debits,
 * the balance shown in the UI, and what `credit_transactions` sums toward. The
 * split columns only record how a balance was funded, so they must never make
 * more credits spendable than the profile actually holds.
 *
 * Reading the split as an independent source of truth is what allowed balances
 * to go negative. Once `credits` dipped below zero, a top-up left
 * `credits_purchased` overstating the real balance by exactly the debt (buy 10
 * against -5 and you get credits=5 but credits_purchased=10), and the old
 * `Math.max(0, credits)` floor hid the debt from the check entirely — so the
 * overspend compounded on every cycle instead of being refused.
 *
 * A `credits` total *above* the split is still fully spendable and counts as
 * complimentary: pre-ledger rows and paths that only bump `credits` (such as the
 * profile-review reward trigger) legitimately leave that gap.
 */
export function getEffectiveCreditBalances(profile: CreditBalanceProfile): {
  purchased: number
  complimentary: number
} {
  const total = Math.max(0, Number(profile.credits) || 0)
  const purchased = Math.min(Math.max(0, Number(profile.credits_purchased) || 0), total)
  return { purchased, complimentary: total - purchased }
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
