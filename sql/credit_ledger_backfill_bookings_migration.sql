-- Backfill credits_purchased_used and credits_complimentary_used for legacy bookings
-- Run AFTER credit_ledger_migration.sql
--
-- Logic: If user ever purchased credits (Stripe or cash), assume their booking used purchased.
--        If user never purchased, assume their booking used complimentary.

-- Include transaction_type = 'purchase' to catch Stripe purchases where credit_source may be NULL
-- (old rows before column existed, or fallback insert that omits credit_source)
WITH users_who_ever_purchased AS (
  SELECT DISTINCT user_id
  FROM credit_transactions
  WHERE amount > 0
    AND (
      credit_source = 'purchase'
      OR credit_source = 'cash'
      OR transaction_type = 'purchase'
    )
),
legacy_bookings AS (
  SELECT id, user_id, credits_used
  FROM bookings
  WHERE credits_used > 0
    AND COALESCE(credits_purchased_used, 0) = 0
    AND COALESCE(credits_complimentary_used, 0) = 0
)
UPDATE bookings b
SET
  credits_purchased_used = CASE WHEN u.user_id IS NOT NULL THEN lb.credits_used ELSE 0 END,
  credits_complimentary_used = CASE WHEN u.user_id IS NOT NULL THEN 0 ELSE lb.credits_used END
FROM legacy_bookings lb
LEFT JOIN users_who_ever_purchased u ON u.user_id = lb.user_id
WHERE b.id = lb.id;
