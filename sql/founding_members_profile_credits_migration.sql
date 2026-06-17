-- Sync Brampton Comedy Insider campaign credits into redeemable profile balances.
-- Run in the Supabase SQL editor AFTER founding_members_migration.sql.

ALTER TABLE public.founding_members
ADD COLUMN IF NOT EXISTS profile_credits_synced INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.founding_members.profile_credits_synced IS
  'Campaign credits already granted to the user profile ledger (redeemable in-app).';
