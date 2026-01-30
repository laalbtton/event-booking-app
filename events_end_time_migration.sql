-- Add end_time to events for explicit end timestamp
ALTER TABLE events
ADD COLUMN IF NOT EXISTS end_time TIMESTAMPTZ;
