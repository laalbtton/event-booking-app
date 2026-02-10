-- Ticketing options for events
ALTER TABLE events
ADD COLUMN IF NOT EXISTS tickets_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS external_event BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS external_ticket_url TEXT;
