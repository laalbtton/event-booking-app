-- ============================================================
-- Audience sign-up sheet imports
-- Emails collected on paper / Excel at live shows, imported by an
-- admin and fed into the existing founding_members + Resend flow.
-- Run in the Supabase SQL editor (safe to re-run).
-- ============================================================

-- ── Import batches (one per paste / CSV upload) ─────────────
CREATE TABLE IF NOT EXISTS public.audience_signup_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- The CASL consent wording printed on the sign-up sheet.
  consent_text TEXT,

  row_count INTEGER NOT NULL DEFAULT 0,
  added_count INTEGER NOT NULL DEFAULT 0,
  existing_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  matched_profile_count INTEGER NOT NULL DEFAULT 0,

  -- Welcome email bookkeeping
  welcome_broadcast_id TEXT,
  welcome_sent_at TIMESTAMPTZ,
  welcome_recipient_count INTEGER,
  welcome_send_mode TEXT, -- 'broadcast' | 'transactional'

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audience_signup_imports_event
  ON public.audience_signup_imports (event_id);
CREATE INDEX IF NOT EXISTS idx_audience_signup_imports_created
  ON public.audience_signup_imports (created_at DESC);

DROP TRIGGER IF EXISTS audience_signup_imports_set_updated_at ON public.audience_signup_imports;
CREATE TRIGGER audience_signup_imports_set_updated_at
  BEFORE UPDATE ON public.audience_signup_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.audience_signup_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audience_signup_imports: admin read" ON public.audience_signup_imports;
CREATE POLICY "audience_signup_imports: admin read"
  ON public.audience_signup_imports FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ── founding_members: where each contact came from ──────────
ALTER TABLE public.founding_members
  ADD COLUMN IF NOT EXISTS source TEXT,                       -- 'insider_campaign' | 'brampton_email' | 'event_signup_sheet'
  ADD COLUMN IF NOT EXISTS source_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS import_batch_id UUID REFERENCES public.audience_signup_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_text TEXT,
  ADD COLUMN IF NOT EXISTS consent_recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS language_preferences JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_attended_event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_attended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attended_event_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_founding_members_source
  ON public.founding_members (source);
CREATE INDEX IF NOT EXISTS idx_founding_members_import_batch
  ON public.founding_members (import_batch_id);
CREATE INDEX IF NOT EXISTS idx_founding_members_language_prefs
  ON public.founding_members USING GIN (language_preferences);

COMMENT ON COLUMN public.founding_members.source IS
  'How the contact entered the list: insider_campaign, brampton_email, event_signup_sheet.';
COMMENT ON COLUMN public.founding_members.consent_text IS
  'Exact CASL consent wording the person agreed to (sign-up sheet header or web form copy).';
COMMENT ON COLUMN public.founding_members.language_preferences IS
  'Languages the attendee said they enjoy shows in, e.g. ["English","Punjabi"].';
