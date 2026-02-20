-- ============================================
-- Poster automation foundation
-- ============================================
-- Adds:
-- - event poster fields
-- - attendee autopost preferences
-- - connected social accounts
-- - social post jobs + attempts
-- - poster publish history

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS poster_url TEXT;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS poster_caption TEXT;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS poster_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram')),
  external_account_id TEXT NOT NULL,
  account_username TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider, external_account_id)
);

CREATE INDEX IF NOT EXISTS social_accounts_user_id_idx ON public.social_accounts(user_id);
CREATE INDEX IF NOT EXISTS social_accounts_provider_idx ON public.social_accounts(provider);
CREATE INDEX IF NOT EXISTS social_accounts_is_active_idx ON public.social_accounts(is_active);

CREATE TABLE IF NOT EXISTS public.poster_auto_post_prefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  auto_post_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS poster_auto_post_prefs_user_global_idx
ON public.poster_auto_post_prefs(user_id)
WHERE event_id IS NULL;

CREATE INDEX IF NOT EXISTS poster_auto_post_prefs_event_id_idx ON public.poster_auto_post_prefs(event_id);

CREATE TABLE IF NOT EXISTS public.poster_publish_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  poster_url TEXT NOT NULL,
  poster_caption TEXT,
  published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS poster_publish_history_event_id_idx ON public.poster_publish_history(event_id);
CREATE INDEX IF NOT EXISTS poster_publish_history_published_at_idx ON public.poster_publish_history(published_at DESC);

CREATE TABLE IF NOT EXISTS public.social_post_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('instagram')),
  poster_url TEXT NOT NULL,
  poster_caption TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'posted', 'failed', 'skipped')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_post_jobs_status_scheduled_idx
  ON public.social_post_jobs(status, scheduled_for);
CREATE INDEX IF NOT EXISTS social_post_jobs_event_id_idx ON public.social_post_jobs(event_id);
CREATE INDEX IF NOT EXISTS social_post_jobs_user_id_idx ON public.social_post_jobs(user_id);

CREATE TABLE IF NOT EXISTS public.social_post_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.social_post_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('posted', 'failed', 'skipped')),
  provider_response JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS social_post_attempts_job_id_idx ON public.social_post_attempts(job_id);
CREATE INDEX IF NOT EXISTS social_post_attempts_created_at_idx ON public.social_post_attempts(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS social_accounts_set_updated_at ON public.social_accounts;
CREATE TRIGGER social_accounts_set_updated_at
BEFORE UPDATE ON public.social_accounts
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS poster_auto_post_prefs_set_updated_at ON public.poster_auto_post_prefs;
CREATE TRIGGER poster_auto_post_prefs_set_updated_at
BEFORE UPDATE ON public.poster_auto_post_prefs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS social_post_jobs_set_updated_at ON public.social_post_jobs;
CREATE TRIGGER social_post_jobs_set_updated_at
BEFORE UPDATE ON public.social_post_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poster_auto_post_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poster_publish_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_post_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "social_accounts_select_own" ON public.social_accounts;
CREATE POLICY "social_accounts_select_own"
ON public.social_accounts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_accounts_modify_own" ON public.social_accounts;
CREATE POLICY "social_accounts_modify_own"
ON public.social_accounts
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "social_accounts_select_admin" ON public.social_accounts;
CREATE POLICY "social_accounts_select_admin"
ON public.social_accounts
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "poster_auto_post_prefs_select_own" ON public.poster_auto_post_prefs;
CREATE POLICY "poster_auto_post_prefs_select_own"
ON public.poster_auto_post_prefs
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "poster_auto_post_prefs_modify_own" ON public.poster_auto_post_prefs;
CREATE POLICY "poster_auto_post_prefs_modify_own"
ON public.poster_auto_post_prefs
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "poster_publish_history_select_scope" ON public.poster_publish_history;
CREATE POLICY "poster_publish_history_select_scope"
ON public.poster_publish_history
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.event_id = poster_publish_history.event_id
      AND b.user_id = auth.uid()
      AND b.status IN ('confirmed', 'waitlist')
  )
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = poster_publish_history.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "social_post_jobs_select_scope" ON public.social_post_jobs;
CREATE POLICY "social_post_jobs_select_scope"
ON public.social_post_jobs
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = social_post_jobs.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

DROP POLICY IF EXISTS "social_post_attempts_select_scope" ON public.social_post_attempts;
CREATE POLICY "social_post_attempts_select_scope"
ON public.social_post_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.social_post_jobs j
    WHERE j.id = social_post_attempts.job_id
      AND (
        j.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.events e
          WHERE e.id = j.event_id
            AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
        )
        OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
      )
  )
);
