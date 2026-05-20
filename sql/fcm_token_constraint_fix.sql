-- Fixes FCM upsert reliability.
--
-- The original migration created a PARTIAL unique index on fcm_token
-- (WHERE fcm_token IS NOT NULL). PostgREST's ON CONFLICT clause does not
-- include the WHERE predicate, so the partial index is never used as the
-- conflict target and the upsert fails.
--
-- This migration replaces the partial index with a full UNIQUE CONSTRAINT,
-- which PostgREST can use correctly.
--
-- Safe to run even if already applied (uses IF EXISTS / IF NOT EXISTS guards).

-- 1. Drop the partial unique index added in the original FCM migration.
DROP INDEX IF EXISTS push_subscriptions_fcm_token_unique;

-- 2. Add a proper UNIQUE CONSTRAINT.
--    In PostgreSQL, a UNIQUE constraint on a nullable column allows multiple
--    NULL values (NULLs are treated as distinct), so existing web-push rows
--    with fcm_token = NULL are unaffected.
ALTER TABLE push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_fcm_token_key;

ALTER TABLE push_subscriptions
  ADD CONSTRAINT push_subscriptions_fcm_token_key UNIQUE (fcm_token);
