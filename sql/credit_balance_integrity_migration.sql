-- ============================================================
-- Credit balance integrity: repair negative balances + block new ones
-- Run this in the Supabase SQL editor
--
-- Context
-- -------
-- Two profiles were sitting at a negative credit balance (-1 and -4) and could
-- still book spots. Root cause was in application code (lib/creditLedger.ts read
-- credits_purchased/credits_complimentary as an independent source of truth and
-- floored `credits` at zero, so a debt was invisible to the affordability check).
-- That is fixed in code, but there was never a database-level guard, which is why
-- the drift went unnoticed for months. This migration adds one.
--
-- Order matters: the CHECK constraint cannot be added while violating rows exist,
-- so the repair runs first, inside the same transaction.
-- ============================================================

BEGIN;

-- ── 1. Write off existing negative balances ─────────────────
-- Balances are reset to 0 rather than invoiced: the total is tiny and the shortfall
-- was caused by our bug, not by the members. Logged as transactions so the ledger
-- continues to reconcile against profiles.credits.

CREATE TEMP TABLE negative_credit_repairs AS
SELECT id AS user_id, credits AS previous_credits
FROM public.profiles
WHERE credits < 0;

INSERT INTO public.credit_transactions (user_id, amount, transaction_type, notes)
SELECT
  user_id,
  -previous_credits,
  'balance_correction',
  'Negative balance written off: ' || previous_credits || ' credits (credit ledger bug)'
FROM negative_credit_repairs;

UPDATE public.profiles p
SET credits             = 0,
    credits_purchased   = 0,
    credits_complimentary = 0,
    updated_at          = now()
FROM negative_credit_repairs r
WHERE p.id = r.user_id;

-- ── 2. Stop the split columns overstating the balance ───────
-- credits_purchased + credits_complimentary must never exceed credits, or the
-- excess reads as spendable credit that no balance backs. Clamping purchased
-- first preserves the purchased-before-complimentary consumption order.
--
-- NOTE: this deliberately does NOT touch profiles whose split exceeds `credits`
-- because of an intentional grant that never landed in `credits` (see
-- scripts/reconcile-credit-ledger.ts). Raise `credits` for those first, then
-- re-run this migration, otherwise the grant is silently confiscated.

-- Scoped to rows repaired in step 1 only. An earlier version of this migration
-- used `credits <= 0`, which also caught profiles sitting at exactly 0 with a
-- real complimentary grant that never landed in `credits`, and zeroed the grant.

UPDATE public.profiles p
SET credits_purchased = 0,
    credits_complimentary = 0,
    updated_at = now()
FROM negative_credit_repairs r
WHERE p.id = r.user_id
  AND COALESCE(p.credits_purchased, 0) + COALESCE(p.credits_complimentary, 0) > GREATEST(p.credits, 0);

-- ── 3. Guard rails ──────────────────────────────────────────

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_credits_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_credits_non_negative CHECK (credits >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_credits_purchased_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_credits_purchased_non_negative CHECK (COALESCE(credits_purchased, 0) >= 0);

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_credits_complimentary_non_negative;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_credits_complimentary_non_negative CHECK (COALESCE(credits_complimentary, 0) >= 0);

COMMENT ON CONSTRAINT profiles_credits_non_negative ON public.profiles IS
  'A booking must never be able to overdraw a member. Any write that trips this is a bug in the debit path, not something to work around by clamping.';

COMMIT;

-- ── Verification ────────────────────────────────────────────
-- Expect zero rows:
--   SELECT id, credits FROM public.profiles WHERE credits < 0;
-- Expect zero rows (split overstating the balance):
--   SELECT id, credits, credits_purchased, credits_complimentary
--   FROM public.profiles
--   WHERE COALESCE(credits_purchased,0) + COALESCE(credits_complimentary,0) > GREATEST(credits,0);
