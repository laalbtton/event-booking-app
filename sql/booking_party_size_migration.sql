-- Audience guests can reserve extra seats (themselves + up to 3 friends).
-- Run in the Supabase SQL editor.

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS party_size INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_party_size_range;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_party_size_range
CHECK (party_size >= 1 AND party_size <= 4);

COMMENT ON COLUMN public.bookings.party_size IS
  'Seats held by this booking. Audience guest RSVPs may be 1-4; performer bookings stay 1.';

CREATE OR REPLACE FUNCTION public.promote_waitlist_and_update_positions_scoped(
  event_uuid UUID,
  booking_scope_filter TEXT DEFAULT NULL,
  event_art_type_uuid UUID DEFAULT NULL,
  capacity_limit INTEGER DEFAULT NULL,
  include_all_art_types BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_waitlist_member RECORD;
  promoted_booking_id UUID := NULL;
  confirmed_spots INTEGER := 0;
  remaining_spots INTEGER := 0;
  max_capacity INTEGER := capacity_limit;
  updated_payload JSON;
BEGIN
  IF max_capacity IS NULL THEN
    SELECT max_attendees INTO max_capacity
    FROM public.events
    WHERE id = event_uuid;
  END IF;

  IF max_capacity IS NULL THEN
    RETURN json_build_object('success', false, 'promoted', false, 'message', 'No capacity limit configured');
  END IF;

  SELECT COALESCE(SUM(GREATEST(COALESCE(party_size, 1), 1)), 0) INTO confirmed_spots
  FROM public.bookings
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
    AND (
      include_all_art_types
      OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    );

  remaining_spots := max_capacity - confirmed_spots;

  IF remaining_spots <= 0 THEN
    RETURN json_build_object('success', false, 'promoted', false, 'message', 'At capacity');
  END IF;

  SELECT id
  INTO next_waitlist_member
  FROM public.bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist'
    AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
    AND (
      include_all_art_types
      OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    )
    AND GREATEST(COALESCE(party_size, 1), 1) <= remaining_spots
  ORDER BY COALESCE(waitlist_position, 999999) ASC, booked_at ASC
  LIMIT 1;

  IF next_waitlist_member IS NULL THEN
    SELECT public.update_waitlist_positions_scoped(
      event_uuid,
      booking_scope_filter,
      event_art_type_uuid,
      include_all_art_types
    ) INTO updated_payload;
    RETURN json_build_object(
      'success', true,
      'promoted', false,
      'positions', updated_payload
    );
  END IF;

  UPDATE public.bookings
  SET status = 'confirmed',
      waitlist_position = NULL
  WHERE id = next_waitlist_member.id;

  promoted_booking_id := next_waitlist_member.id;

  SELECT public.update_waitlist_positions_scoped(
    event_uuid,
    booking_scope_filter,
    event_art_type_uuid,
    include_all_art_types
  ) INTO updated_payload;

  RETURN json_build_object(
    'success', true,
    'promoted', true,
    'promoted_booking_id', promoted_booking_id,
    'positions', updated_payload
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_waitlist_and_update_positions_scoped(UUID, TEXT, UUID, INTEGER, BOOLEAN) TO authenticated;
