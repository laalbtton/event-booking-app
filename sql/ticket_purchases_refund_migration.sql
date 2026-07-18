-- Support self-service ticket cancellation/refund (always refunded as app credits).
-- Run once in the Supabase SQL editor.

ALTER TABLE ticket_purchases
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz;

COMMENT ON COLUMN ticket_purchases.refunded_at IS
  'Set when a buyer self-cancels their tickets. Refund value is always issued as app credits ($1 = 1 credit), regardless of original payment method (Stripe card or credits).';

-- Buyers need to be able to update their own purchase to 'refunded' status when self-cancelling.
-- Service role (used by our API routes) bypasses RLS entirely, but this keeps the table's
-- policies consistent in case client-side reads/writes are ever added.
DROP POLICY IF EXISTS "Users update own ticket purchases" ON ticket_purchases;
CREATE POLICY "Users update own ticket purchases"
  ON ticket_purchases FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
