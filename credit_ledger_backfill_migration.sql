-- Backfill credits_purchased and credits_complimentary from credit_transactions
-- Run AFTER credit_ledger_migration.sql and credit_transactions_backfill_credit_source_migration.sql
-- Consumption rule: purchased first, then complimentary

WITH user_totals AS (
  SELECT
    user_id,
    COALESCE(SUM(CASE WHEN amount > 0 AND credit_source = 'purchase' THEN amount ELSE 0 END), 0) AS total_purchased,
    COALESCE(SUM(CASE
      WHEN amount > 0 AND (credit_source IN ('in_kind', 'cash')
        OR (credit_source IS NULL AND transaction_type IN ('manual_add', 'welcome_invite_credit')))
      THEN amount ELSE 0 END), 0) AS total_complimentary,
    COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) AS total_debits
  FROM credit_transactions
  GROUP BY user_id
),
computed AS (
  SELECT
    ut.user_id,
    ut.total_purchased,
    ut.total_complimentary,
    ut.total_debits,
    GREATEST(0, ut.total_purchased + ut.total_debits) AS credits_purchased,
    GREATEST(0, ut.total_complimentary - GREATEST(0, (-ut.total_debits) - ut.total_purchased)) AS credits_complimentary
  FROM user_totals ut
)
UPDATE profiles p
SET
  credits_purchased = COALESCE(c.credits_purchased, 0),
  credits_complimentary = COALESCE(c.credits_complimentary, 0)
FROM computed c
WHERE p.id = c.user_id;

-- Users with no credit_transactions: ensure credits = credits_purchased + credits_complimentary
-- (migration already set defaults 0,0; if credits exists, we could set complimentary = credits for legacy)
UPDATE profiles
SET credits_complimentary = GREATEST(0, credits - COALESCE(credits_purchased, 0))
WHERE credits_purchased = 0 AND credits_complimentary = 0 AND credits > 0;
