-- Track which Stripe mode the stored customer id belongs to
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS stripe_customer_mode TEXT;
