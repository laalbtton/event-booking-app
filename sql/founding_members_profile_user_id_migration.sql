-- Link founding_members rows to app profiles for reliable credit sync.
-- Run in Supabase SQL editor (safe to re-run).

ALTER TABLE public.founding_members
  ADD COLUMN IF NOT EXISTS profile_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_founding_members_profile_user_id
  ON public.founding_members (profile_user_id);

COMMENT ON COLUMN public.founding_members.profile_user_id IS
  'App user id when the member enrolled while logged in; used for credit sync.';
