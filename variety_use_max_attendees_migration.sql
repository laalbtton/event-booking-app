-- Variety open mic global capacity mode

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS variety_use_max_attendees BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.update_waitlist_positions_scoped(
  event_uuid UUID,
  booking_scope_filter TEXT DEFAULT NULL,
  event_art_type_uuid UUID DEFAULT NULL,
  include_all_art_types BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  waitlist_record RECORD;
  new_position INTEGER := 1;
  updated_count INTEGER := 0;
  total_waitlist INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO total_waitlist
  FROM public.bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist'
    AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
    AND (
      include_all_art_types
      OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    );

  FOR waitlist_record IN
    SELECT id, waitlist_position, booked_at
    FROM public.bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
      AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
      AND (
        include_all_art_types
        OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
        OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
      )
    ORDER BY COALESCE(waitlist_position, 999999) ASC, booked_at ASC
  LOOP
    UPDATE public.bookings
    SET waitlist_position = new_position
    WHERE id = waitlist_record.id;

    IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
      updated_count := updated_count + 1;
    END IF;
    new_position := new_position + 1;
  END LOOP;

  UPDATE public.bookings
  SET waitlist_position = NULL
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
    AND (
      include_all_art_types
      OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    )
    AND waitlist_position IS NOT NULL;

  RETURN json_build_object(
    'success', true,
    'total_waitlist', total_waitlist,
    'updated_count', updated_count
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

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
  confirmed_count INTEGER := 0;
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

  SELECT COUNT(*) INTO confirmed_count
  FROM public.bookings
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
    AND (
      include_all_art_types
      OR (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    );

  IF confirmed_count >= max_capacity THEN
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

GRANT EXECUTE ON FUNCTION public.update_waitlist_positions_scoped(UUID, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_and_update_positions_scoped(UUID, TEXT, UUID, INTEGER, BOOLEAN) TO authenticated;

