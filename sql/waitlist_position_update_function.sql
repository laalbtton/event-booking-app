-- Database function to update waitlist positions for an event
-- This function runs with SECURITY DEFINER to bypass RLS and update all waitlist positions

CREATE OR REPLACE FUNCTION update_waitlist_positions(event_uuid UUID)
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
  -- Count total waitlist members
  SELECT COUNT(*) INTO total_waitlist
  FROM bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist';
  
  -- Update all waitlist positions sequentially (1, 2, 3, etc.)
  -- Ordered by current waitlist_position, then by booked_at as tiebreaker
  FOR waitlist_record IN
    SELECT id, waitlist_position, booked_at
    FROM bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
    ORDER BY 
      COALESCE(waitlist_position, 999999) ASC,
      booked_at ASC
  LOOP
    -- Always update the position to ensure it's correct
    -- This handles cases where positions might be out of sync
    UPDATE bookings
    SET waitlist_position = new_position
    WHERE id = waitlist_record.id;
    
    -- Only count as "updated" if the position actually changed
    IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
      updated_count := updated_count + 1;
    END IF;
    
    new_position := new_position + 1;
  END LOOP;
  
  -- Set waitlist_position to NULL for any confirmed bookings that might still have a position
  UPDATE bookings
  SET waitlist_position = NULL
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND waitlist_position IS NOT NULL;
  
  -- Return result
  RETURN json_build_object(
    'success', true,
    'total_waitlist', total_waitlist,
    'updated_count', updated_count,
    'message', format('Updated %s of %s waitlist positions', updated_count, total_waitlist)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', 'Error updating waitlist positions'
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION update_waitlist_positions(UUID) TO authenticated;

-- Note: The SECURITY DEFINER flag makes this function run with the privileges
-- of the user who created it (typically the database owner), allowing it to
-- bypass RLS policies and update all bookings for the event.
