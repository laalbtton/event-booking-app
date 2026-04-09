-- Instagram username collection prompt (profile fields + feature flag)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_prompt_snoozed_until timestamptz NULL,
  ADD COLUMN IF NOT EXISTS instagram_no_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.instagram_prompt_snoozed_until IS 'When set in the future, the Instagram username prompt is hidden until this time.';
COMMENT ON COLUMN public.profiles.instagram_no_account IS 'User chose “I don’t have Instagram”; do not show the prompt again.';

INSERT INTO public.system_feature_flags (key, enabled, updated_at)
VALUES ('instagram_username_prompt', true, now())
ON CONFLICT (key) DO NOTHING;
