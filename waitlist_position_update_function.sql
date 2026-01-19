-- Database function to update waitlist positions for an event
-- This function runs with SECURITY DEFINER to bypass RLS and update all waitlist positions

CREATE OR REPLACE FUNCTION update_waitlist_positions(event_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  waitlist_record RECORD;
  new_position INTEGER := 1;
BEGIN
  -- Update all waitlist positions sequentially (1, 2, 3, etc.)
  -- Ordered by current waitlist_position, then by booked_at as tiebreaker
  FOR waitlist_record IN
    SELECT id, waitlist_position
    FROM bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
    ORDER BY 
      COALESCE(waitlist_position, 999999) ASC,
      booked_at ASC
  LOOP
    -- Only update if position has changed
    IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
      UPDATE bookings
      SET waitlist_position = new_position
      WHERE id = waitlist_record.id;
    END IF;
    
    new_position := new_position + 1;
  END LOOP;
  
  -- Set waitlist_position to NULL for any confirmed bookings that might still have a position
  UPDATE bookings
  SET waitlist_position = NULL
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND waitlist_position IS NOT NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_waitlist_positions(UUID) TO authenticated;

-- Note: The SECURITY DEFINER flag makes this function run with the privileges
-- of the user who created it (typically the database owner), allowing it to
-- bypass RLS policies and update all bookings for the event.
