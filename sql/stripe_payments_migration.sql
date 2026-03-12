-- Add Stripe customer reference on profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- Track Stripe payment intent on credit transactions
ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS stripe_payment_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_stripe_payment_id_key
  ON credit_transactions (stripe_payment_id)
  WHERE stripe_payment_id IS NOT NULL;
