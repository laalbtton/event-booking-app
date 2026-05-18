-- FCM Push Notifications Migration
-- Run this in Supabase SQL Editor (or via the Supabase CLI migrations system).
--
-- Adds two columns to push_subscriptions:
--   platform   TEXT  – 'web' | 'android' | 'ios'  (default 'web' for existing rows)
--   fcm_token  TEXT  – FCM registration token for android/ios subscriptions
-- Adds a unique index on fcm_token so upserts are idempotent.

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS platform  TEXT NOT NULL DEFAULT 'web'
    CHECK (platform IN ('web', 'android', 'ios')),
  ADD COLUMN IF NOT EXISTS fcm_token TEXT;

-- Unique index used as the conflict target when upserting native subscriptions.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_fcm_token_unique
  ON push_subscriptions (fcm_token)
  WHERE fcm_token IS NOT NULL;

-- Back-fill existing rows so they are clearly identified as web subscriptions.
UPDATE push_subscriptions
  SET platform = 'web'
  WHERE platform IS DISTINCT FROM 'web';
