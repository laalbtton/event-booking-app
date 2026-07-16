-- ============================================================
-- Live Mode enable toggle
-- Host enables Live Mode from Manage Attendees so attendees see it.
-- Run after event_live_mode_migration.sql
-- ============================================================

ALTER TABLE public.event_live_state
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.event_live_state.enabled IS
  'When true, confirmed attendees see Live Mode entry points. Hosts always can open Live Mode.';
