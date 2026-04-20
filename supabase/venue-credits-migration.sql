-- Venue Credit Passes migration
-- Run once in the Supabase SQL editor.
--
-- Creates venue_credit_grants (venue-restricted complimentary passes)
-- and adds venue_id + credits_venue_used columns to support the new flow.

-- ── 1. New table: venue_credit_grants ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS venue_credit_grants (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id          UUID        NOT NULL REFERENCES venues(id)   ON DELETE CASCADE,
  credits_total     INTEGER     NOT NULL CHECK (credits_total > 0),
  credits_remaining INTEGER     NOT NULL CHECK (credits_remaining >= 0),
  notes             TEXT,
  issued_by         UUID        REFERENCES profiles(id),
  issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,           -- NULL = never expires
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS venue_credit_grants_user_venue
  ON venue_credit_grants (user_id, venue_id);

CREATE INDEX IF NOT EXISTS venue_credit_grants_venue
  ON venue_credit_grants (venue_id);

-- RLS
ALTER TABLE venue_credit_grants ENABLE ROW LEVEL SECURITY;

-- Users can read their own grants
CREATE POLICY "Users read own venue credit grants"
  ON venue_credit_grants FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can do everything (service role bypasses RLS anyway)
CREATE POLICY "Admins manage venue credit grants"
  ON venue_credit_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ── 2. Add venue_id to credit_transactions ───────────────────────────────────
-- Links a transaction to a venue so the admin report can filter/group by venue.

ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id);

-- ── 3. Add credits_venue_used to bookings ────────────────────────────────────
-- Tracks how many venue-pass credits were applied for this booking.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS credits_venue_used INTEGER NOT NULL DEFAULT 0;
