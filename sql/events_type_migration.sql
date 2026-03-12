-- Add event_type to events for show type control
ALTER TABLE events
ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'open_mic';

ALTER TABLE events
ADD CONSTRAINT events_event_type_check
CHECK (event_type IN ('open_mic', 'booked_show'));
