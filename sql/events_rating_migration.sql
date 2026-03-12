-- Database Migration: Event Ratings
-- Adds a rating field to events for age/content guidance

ALTER TABLE events
ADD COLUMN IF NOT EXISTS rating TEXT DEFAULT '18+';

-- Add a check constraint to enforce allowed values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_rating_check'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_rating_check
    CHECK (rating IN ('All Ages', '13+', '16+', '18+'));
  END IF;
END $$;
