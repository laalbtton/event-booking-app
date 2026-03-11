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
