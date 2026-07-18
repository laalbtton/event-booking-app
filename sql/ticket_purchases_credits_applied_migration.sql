-- Allow ticket purchases to be partially or fully paid with app credits.
-- Run once in the Supabase SQL editor.

ALTER TABLE ticket_purchases
  ADD COLUMN IF NOT EXISTS credits_applied_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN ticket_purchases.credits_applied_cents IS
  'Portion of total_cents covered by the buyer''s app credits ($1 = 1 credit). Remainder (total_cents - credits_applied_cents) is charged via Stripe.';

-- Purchases fully covered by credits have no Stripe session, so allow that column to stay NULL
-- (it already permits NULL — this is just a safety no-op if a stricter constraint was ever added).
ALTER TABLE ticket_purchases
  ALTER COLUMN stripe_session_id DROP NOT NULL;
