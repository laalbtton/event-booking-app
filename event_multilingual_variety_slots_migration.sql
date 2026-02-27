-- Multilingual metadata + variety arts slot buckets

-- ---------------------------------------------
-- events: multilingual fields + open mic subtype
-- ---------------------------------------------
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS is_multilingual BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS languages TEXT[] NOT NULL DEFAULT ARRAY['English']::TEXT[];

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS open_mic_type TEXT;

UPDATE public.events
SET open_mic_type = 'comedy_open_mic'
WHERE event_type = 'open_mic'
  AND open_mic_type IS NULL;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_open_mic_type_check;

ALTER TABLE public.events
ADD CONSTRAINT events_open_mic_type_check
CHECK (
  open_mic_type IS NULL
  OR open_mic_type IN ('comedy_open_mic', 'variety_arts_open_mic')
);

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_open_mic_type_required_for_open_mic;

ALTER TABLE public.events
ADD CONSTRAINT events_open_mic_type_required_for_open_mic
CHECK (
  event_type <> 'open_mic'
  OR open_mic_type IS NOT NULL
);

-- ---------------------------------------------
-- event_art_types: per-event art buckets/slots
-- ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_art_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  art_type_name TEXT NOT NULL,
  slot_capacity INTEGER NOT NULL CHECK (slot_capacity >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_art_types_event_id
  ON public.event_art_types(event_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_art_types_event_name_unique
  ON public.event_art_types(event_id, lower(art_type_name));

CREATE OR REPLACE FUNCTION public.set_event_art_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS event_art_types_set_updated_at ON public.event_art_types;
CREATE TRIGGER event_art_types_set_updated_at
BEFORE UPDATE ON public.event_art_types
FOR EACH ROW
EXECUTE FUNCTION public.set_event_art_types_updated_at();

ALTER TABLE public.event_art_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_art_types_public_read ON public.event_art_types;
CREATE POLICY event_art_types_public_read
ON public.event_art_types
FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS event_art_types_manage_by_creator_or_admin ON public.event_art_types;
CREATE POLICY event_art_types_manage_by_creator_or_admin
ON public.event_art_types
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_art_types.event_id
      AND (
        e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = event_art_types.event_id
      AND (
        e.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.role = 'admin'
        )
      )
  )
);

-- ---------------------------------------------
-- bookings: selected art bucket for performers
-- ---------------------------------------------
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS event_art_type_id UUID REFERENCES public.event_art_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_event_art_type_status
  ON public.bookings(event_id, event_art_type_id, status);

-- ---------------------------------------------------------
-- Scoped helper functions for per-type waitlist management
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_waitlist_positions_scoped(
  event_uuid UUID,
  booking_scope_filter TEXT DEFAULT NULL,
  event_art_type_uuid UUID DEFAULT NULL
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
      (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    );

  FOR waitlist_record IN
    SELECT id, waitlist_position, booked_at
    FROM public.bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
      AND (booking_scope_filter IS NULL OR booking_scope = booking_scope_filter)
      AND (
        (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
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
      (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
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
  capacity_limit INTEGER DEFAULT NULL
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
      (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
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
      (event_art_type_uuid IS NULL AND event_art_type_id IS NULL)
      OR (event_art_type_uuid IS NOT NULL AND event_art_type_id = event_art_type_uuid)
    )
  ORDER BY COALESCE(waitlist_position, 999999) ASC, booked_at ASC
  LIMIT 1;

  IF next_waitlist_member IS NULL THEN
    SELECT public.update_waitlist_positions_scoped(event_uuid, booking_scope_filter, event_art_type_uuid)
    INTO updated_payload;
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

  SELECT public.update_waitlist_positions_scoped(event_uuid, booking_scope_filter, event_art_type_uuid)
  INTO updated_payload;

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

GRANT EXECUTE ON FUNCTION public.update_waitlist_positions_scoped(UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_waitlist_and_update_positions_scoped(UUID, TEXT, UUID, INTEGER) TO authenticated;
