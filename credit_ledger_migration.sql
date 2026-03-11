-- Credit ledger: track purchased vs complimentary credits
-- Purchased credits = from Stripe (1 credit = $1)
-- Complimentary = manual add (in_kind/cash), welcome invite, etc.
-- Consumption rule: use purchased first, then complimentary

-- Profiles: split balance
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS credits_purchased INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_complimentary INTEGER NOT NULL DEFAULT 0;

-- Bookings: record which credits were used per booking (for reporting)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS credits_purchased_used INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_complimentary_used INTEGER NOT NULL DEFAULT 0;

-- Ensure credits = credits_purchased + credits_complimentary (for new rows)
-- Existing rows will be backfilled separately
