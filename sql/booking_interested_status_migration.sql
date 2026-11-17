-- Allow audience RSVPs of "interested" (not going yet) on free booked shows.
-- Going uses status = 'confirmed'. Interested does not count toward capacity.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'bookings'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) ILIKE '%confirmed%'
  LOOP
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('confirmed', 'cancelled', 'waitlist', 'interested'));

COMMENT ON CONSTRAINT bookings_status_check ON public.bookings IS
  'interested = free RSVP not yet going; confirmed/waitlist/cancelled unchanged.';

CREATE INDEX IF NOT EXISTS idx_bookings_event_interested
  ON public.bookings (event_id)
  WHERE status = 'interested' AND booking_scope = 'audience';
