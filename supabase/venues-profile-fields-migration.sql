-- ============================================================
-- Venue profile fields: public description, Google review link, website
-- Run in the Supabase SQL editor
-- ============================================================

ALTER TABLE venues ADD COLUMN IF NOT EXISTS description     TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS google_review_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS website_url     TEXT;

-- Allow venue managers (venue_staff with any active role) to update their own venue's profile fields.
-- Structural fields (name, address) can be updated by admins via the existing admin policy.
-- We broaden the UPDATE policy to also allow active venue_staff for that venue.

DROP POLICY IF EXISTS "Only admins can update venues" ON venues;

CREATE POLICY "Admins or venue managers can update venues"
  ON venues FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM venue_staff
      WHERE venue_staff.venue_id = venues.id
        AND venue_staff.user_id  = auth.uid()
        AND venue_staff.active   = true
    )
  );
