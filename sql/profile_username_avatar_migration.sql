-- =============================================================
-- Profile username + avatar storage
--
-- 1. Adds a unique, slug-safe `username` column to profiles.
--    When set, /profile/<username> replaces /profile/<uuid>.
-- 2. Creates the `avatars` Supabase Storage bucket so performers
--    can upload profile pictures directly from the edit profile page.
--
-- Safe to re-run: all statements are idempotent.
-- Run the entire file in one execution in the Supabase SQL editor.
-- =============================================================

-- 1. USERNAME COLUMN -----------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Format rules: 3–30 chars, lowercase letters/digits/underscores/hyphens,
-- must start and end with a letter or digit.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (
    username IS NULL OR (
      char_length(username) >= 3
      AND char_length(username) <= 30
      AND username ~ '^[a-z0-9][a-z0-9_-]*[a-z0-9]$'
    )
  );

-- Case-insensitive unique index so "JohnDoe" and "johndoe" are the same.
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_ci
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

COMMENT ON COLUMN public.profiles.username IS
  'Custom URL slug for /profile/<username>. Unique, 3–30 chars, '
  'lowercase alphanumeric + underscore/hyphen. Stored as-entered; '
  'lookups use lower(username) for case-insensitivity.';

-- 2. AVATARS STORAGE BUCKET ----------------------------------------
-- Creates the bucket only if it does not already exist.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,        -- public: images are served without auth
  5242880,     -- 5 MB max per file
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects (scoped to the avatars bucket)

-- Anyone (anon + auth) can read avatars
DROP POLICY IF EXISTS "avatars_select_public" ON storage.objects;
CREATE POLICY "avatars_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload into their own subfolder: <user_id>/avatar.<ext>
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
CREATE POLICY "avatars_insert_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can update their own avatar
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
CREATE POLICY "avatars_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own avatar
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
CREATE POLICY "avatars_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
