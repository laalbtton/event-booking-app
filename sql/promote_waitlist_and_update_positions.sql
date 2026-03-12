-- Comprehensive function to promote waitlist member and update all positions
-- This function handles both promotion and position updates in one transaction
-- Runs with SECURITY DEFINER to bypass RLS

CREATE OR REPLACE FUNCTION promote_waitlist_and_update_positions(event_uuid UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  waitlist_record RECORD;
  next_waitlist_member RECORD;
  new_position INTEGER := 1;
  updated_count INTEGER := 0;
  total_waitlist INTEGER := 0;
  promoted_booking_id UUID := NULL;
  confirmed_count INTEGER := 0;
  max_attendees_val INTEGER := NULL;
BEGIN
  -- Get event max_attendees
  SELECT max_attendees INTO max_attendees_val
  FROM events
  WHERE id = event_uuid;
  
  -- If no max_attendees, nothing to do
  IF max_attendees_val IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'message', 'Event has no max_attendees limit'
    );
  END IF;
  
  -- Get current confirmed count
  SELECT COUNT(*) INTO confirmed_count
  FROM bookings
  WHERE event_id = event_uuid
    AND status = 'confirmed';
  
  -- Check if there's space for promotion
  IF confirmed_count >= max_attendees_val THEN
    RETURN json_build_object(
      'success', false,
      'message', format('Event is at capacity (%s/%s)', confirmed_count, max_attendees_val)
    );
  END IF;
  
  -- Find the next waitlist member to promote (lowest position, then earliest booked_at)
  SELECT id, user_id, waitlist_position, booked_at
  INTO next_waitlist_member
  FROM bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist'
  ORDER BY 
    COALESCE(waitlist_position, 999999) ASC,
    booked_at ASC
  LIMIT 1;
  
  -- If no waitlist member found, just update positions
  IF next_waitlist_member IS NULL THEN
    -- Just update positions without promotion
    SELECT COUNT(*) INTO total_waitlist
    FROM bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist';
    
    FOR waitlist_record IN
      SELECT id, waitlist_position
      FROM bookings
      WHERE event_id = event_uuid
        AND status = 'waitlist'
      ORDER BY 
        COALESCE(waitlist_position, 999999) ASC,
        booked_at ASC
    LOOP
      UPDATE bookings
      SET waitlist_position = new_position
      WHERE id = waitlist_record.id;
      
      IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
        updated_count := updated_count + 1;
      END IF;
      
      new_position := new_position + 1;
    END LOOP;
    
    RETURN json_build_object(
      'success', true,
      'promoted', false,
      'total_waitlist', total_waitlist,
      'updated_count', updated_count,
      'message', format('Updated %s waitlist positions (no promotion needed)', updated_count)
    );
  END IF;
  
  -- Promote the waitlist member to confirmed
  UPDATE bookings
  SET 
    status = 'confirmed',
    waitlist_position = NULL
  WHERE id = next_waitlist_member.id;
  
  promoted_booking_id := next_waitlist_member.id;
  
  -- Get updated waitlist count after promotion
  SELECT COUNT(*) INTO total_waitlist
  FROM bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist';
  
  -- Update all remaining waitlist positions
  FOR waitlist_record IN
    SELECT id, waitlist_position
    FROM bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
    ORDER BY 
      COALESCE(waitlist_position, 999999) ASC,
      booked_at ASC
  LOOP
    -- Always update to ensure correct position
    UPDATE bookings
    SET waitlist_position = new_position
    WHERE id = waitlist_record.id;
    
    -- Count as updated if position changed
    IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
      updated_count := updated_count + 1;
    END IF;
    
    new_position := new_position + 1;
  END LOOP;
  
  -- Clean up: Set waitlist_position to NULL for any confirmed bookings that might still have it
  UPDATE bookings
  SET waitlist_position = NULL
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND waitlist_position IS NOT NULL;
  
  RETURN json_build_object(
    'success', true,
    'promoted', true,
    'promoted_booking_id', promoted_booking_id,
    'total_waitlist', total_waitlist,
    'updated_count', updated_count,
    'message', format('Promoted booking %s and updated %s waitlist positions', promoted_booking_id, updated_count)
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM,
      'message', format('Error: %s', SQLERRM)
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION promote_waitlist_and_update_positions(UUID) TO authenticated;

-- Also keep the simpler function for just updating positions
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
  SELECT COUNT(*) INTO total_waitlist
  FROM bookings
  WHERE event_id = event_uuid
    AND status = 'waitlist';
  
  FOR waitlist_record IN
    SELECT id, waitlist_position, booked_at
    FROM bookings
    WHERE event_id = event_uuid
      AND status = 'waitlist'
    ORDER BY 
      COALESCE(waitlist_position, 999999) ASC,
      booked_at ASC
  LOOP
    -- Always update the position
    UPDATE bookings
    SET waitlist_position = new_position
    WHERE id = waitlist_record.id;
    
    -- Count as updated if position changed
    IF waitlist_record.waitlist_position IS NULL OR waitlist_record.waitlist_position != new_position THEN
      updated_count := updated_count + 1;
    END IF;
    
    new_position := new_position + 1;
  END LOOP;
  
  -- Clean up confirmed bookings
  UPDATE bookings
  SET waitlist_position = NULL
  WHERE event_id = event_uuid
    AND status = 'confirmed'
    AND waitlist_position IS NOT NULL;
  
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
      'message', format('Error: %s', SQLERRM)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION update_waitlist_positions(UUID) TO authenticated;
