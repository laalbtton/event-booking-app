-- Create a partial unique index on eventbrite_id so Eventbrite sync can upsert safely.
-- Run this in the Supabase SQL editor.

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_eventbrite_id
  ON public.events(eventbrite_id)
  WHERE eventbrite_id IS NOT NULL;
