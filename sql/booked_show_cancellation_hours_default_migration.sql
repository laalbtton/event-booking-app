-- Booked shows previously had cancellation_hours forced to 0 (no ticket cancellation policy
-- was enforced). We now use this same field as the ticket cancellation policy for booked shows,
-- defaulting to 24 hours. Backfill existing booked shows that still have the old 0 value.
-- Run once in the Supabase SQL editor.

UPDATE events
SET cancellation_hours = 24
WHERE event_type = 'booked_show'
  AND (cancellation_hours IS NULL OR cancellation_hours = 0);
