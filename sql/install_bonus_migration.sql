-- Add install bonus support: 5 credits when user installs the app
-- Run in Supabase SQL editor

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS install_bonus_granted_at TIMESTAMPTZ;

-- Add install_bonus to credit_source check
ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_credit_source_check;
ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_credit_source_check
CHECK (credit_source IS NULL OR credit_source IN ('purchase', 'cash', 'in_kind', 'install_bonus'));
