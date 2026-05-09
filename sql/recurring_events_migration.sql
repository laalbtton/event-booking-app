-- Recurring events: event_series table + occurrence columns on events
-- Run this in Supabase SQL editor or via migration tool.

-- ─── 1. event_series ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_series (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Recurrence rule
  recurrence_type    TEXT        NOT NULL
                     CHECK (recurrence_type IN ('weekly', 'biweekly', 'monthly_weekday')),
  day_of_week        SMALLINT,        -- 0 (Sun) – 6 (Sat); used by weekly + biweekly
  week_of_month      SMALLINT,        -- 1-4 or -1 (last); used by monthly_weekday
  start_time_local   TIME        NOT NULL,  -- wall-clock time in Eastern (e.g. '20:00')
  duration_minutes   INTEGER,

  -- Auto-extend horizon
  horizon_weeks      INTEGER     NOT NULL DEFAULT 12,

  -- Series lifecycle
  status             TEXT        NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'paused', 'ended')),

  -- Template fields — copied into each generated event occurrence
  title              TEXT        NOT NULL,
  description        TEXT,
  venue_id           UUID        REFERENCES venues(id),
  location           TEXT,
  credits_required   INTEGER     NOT NULL DEFAULT 0,
  max_attendees      INTEGER,
  cancellation_hours INTEGER     NOT NULL DEFAULT 24,
  host_user_id       UUID        REFERENCES auth.users(id),
  created_by         UUID        REFERENCES auth.users(id),
  event_type         TEXT        NOT NULL DEFAULT 'open_mic',
  open_mic_type      TEXT,
  rating             TEXT,
  theme              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Link occurrences back to the series ──────────────────────────────────

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS series_id                UUID     REFERENCES event_series(id),
  ADD COLUMN IF NOT EXISTS series_occurrence_number INTEGER,
  ADD COLUMN IF NOT EXISTS series_overridden         BOOLEAN  NOT NULL DEFAULT FALSE;

-- Index for fast series lookups
CREATE INDEX IF NOT EXISTS events_series_id_idx
  ON events (series_id, series_occurrence_number)
  WHERE series_id IS NOT NULL;

-- ─── 3. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE event_series ENABLE ROW LEVEL SECURITY;

-- Hosts can see their own series; admins can see all
CREATE POLICY "event_series_select" ON event_series
  FOR SELECT USING (
    auth.uid() = host_user_id
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "event_series_insert" ON event_series
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
  );

CREATE POLICY "event_series_update" ON event_series
  FOR UPDATE USING (
    auth.uid() = host_user_id
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "event_series_delete" ON event_series
  FOR DELETE USING (
    auth.uid() = host_user_id
    OR auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ─── 4. updated_at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_event_series_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS event_series_updated_at ON event_series;
CREATE TRIGGER event_series_updated_at
  BEFORE UPDATE ON event_series
  FOR EACH ROW EXECUTE FUNCTION update_event_series_updated_at();
