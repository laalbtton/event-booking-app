-- RLS Policy: Allow users to update their own bookings' waitlist_position
-- This policy allows authenticated users to update waitlist_position on their own bookings

-- First, check if RLS is enabled on the bookings table
-- (If not, enable it first with: ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;)

-- Policy to allow users to update their own bookings
-- This covers all columns including waitlist_position
CREATE POLICY "Users can update their own bookings"
ON bookings
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Alternative: If you want a more specific policy just for waitlist_position updates
-- (You can use this instead of the above if you want more granular control)
-- Note: Supabase doesn't support column-level policies directly, but you can restrict
-- what columns can be updated in your application logic

-- If the above policy already exists and you want to replace it:
-- DROP POLICY IF EXISTS "Users can update their own bookings" ON bookings;
-- Then run the CREATE POLICY statement above

-- To check existing policies:
-- SELECT * FROM pg_policies WHERE tablename = 'bookings';

-- To see if RLS is enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'bookings';
