-- ============================================================
-- Brampton Comedy Insider — founding members campaign
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.founding_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  first_name TEXT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,

  magic_link_sent_at TIMESTAMPTZ,
  signup_completed BOOLEAN NOT NULL DEFAULT FALSE,
  preferences_completed BOOLEAN NOT NULL DEFAULT FALSE,

  email_updates_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  -- Not user-facing yet (retention/re-engagement only)
  whatsapp_updates_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  app_account_activated BOOLEAN NOT NULL DEFAULT FALSE,

  total_credits_earned INTEGER NOT NULL DEFAULT 0,
  profile_credits_synced INTEGER NOT NULL DEFAULT 0,

  account_credit_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  preferences_credit_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  email_updates_credit_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  -- Backend-only future rewards
  whatsapp_credit_awarded BOOLEAN NOT NULL DEFAULT FALSE,
  app_credit_awarded BOOLEAN NOT NULL DEFAULT FALSE,

  -- Preferences
  age_range TEXT,
  canada_status TEXT,
  city TEXT,
  downtown_brampton_interest TEXT,
  comedy_preferences JSONB DEFAULT '[]'::jsonb,
  preferred_days JSONB DEFAULT '[]'::jsonb,
  preferred_time TEXT,
  ticket_price_range TEXT,
  favorite_comedians TEXT,
  event_interests JSONB DEFAULT '[]'::jsonb,
  attendance_frequency TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Case-insensitive email uniqueness (emails are stored lowercased by the app,
-- this guards against accidental mixed-case duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS idx_founding_members_email_lower
  ON public.founding_members (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_founding_members_created_at
  ON public.founding_members (created_at DESC);

-- updated_at trigger (shared helper if it already exists, otherwise create it)
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS founding_members_set_updated_at ON public.founding_members;
CREATE TRIGGER founding_members_set_updated_at
  BEFORE UPDATE ON public.founding_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ── RLS ──────────────────────────────────────────────────────
-- All writes/reads from the app go through the service-role key (which bypasses
-- RLS). We enable RLS and add an admin read policy so no anonymous client can
-- read the email list directly.
ALTER TABLE public.founding_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "founding_members: admin read" ON public.founding_members;
CREATE POLICY "founding_members: admin read"
  ON public.founding_members FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );
