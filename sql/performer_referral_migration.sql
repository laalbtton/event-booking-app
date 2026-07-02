-- ============================================================
-- Performer Referral Tracking
-- Tracks which performer referred a new user to the app.
-- Run this in the Supabase SQL editor.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_profiles_referred_by
  ON public.profiles(referred_by);

COMMENT ON COLUMN public.profiles.referred_by
  IS 'The performer/event_creator profile that referred this user to the app. Set once at onboarding; immutable after that.';
