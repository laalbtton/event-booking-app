-- Backfill credit_source for old manual_add and welcome_invite_credit transactions
-- so they are counted as complimentary (in_kind) in reports
UPDATE credit_transactions
SET credit_source = 'in_kind'
WHERE transaction_type IN ('manual_add', 'welcome_invite_credit')
  AND credit_source IS NULL;
