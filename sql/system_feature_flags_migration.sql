-- Feature flags controlled by super admins.
CREATE TABLE IF NOT EXISTS public.system_feature_flags (
  key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.system_feature_flags ENABLE ROW LEVEL SECURITY;

-- App reads/writes this table through service-role API routes only.
DROP POLICY IF EXISTS "No direct reads of system_feature_flags" ON public.system_feature_flags;
CREATE POLICY "No direct reads of system_feature_flags"
  ON public.system_feature_flags
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No direct writes of system_feature_flags" ON public.system_feature_flags;
CREATE POLICY "No direct writes of system_feature_flags"
  ON public.system_feature_flags
  FOR ALL
  USING (false)
  WITH CHECK (false);
