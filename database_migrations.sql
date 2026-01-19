-- Database Migration: User Profile System
-- This file contains SQL statements to add the required columns and functions
-- for the user profile system feature.

-- 1. Add new columns to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS website_link TEXT,
ADD COLUMN IF NOT EXISTS instagram_link TEXT,
ADD COLUMN IF NOT EXISTS youtube_link TEXT,
ADD COLUMN IF NOT EXISTS twitter_link TEXT;

-- 2. Add attendance_status column to bookings table
-- This column tracks: 'attended', 'no_show', or NULL (confirmed/pending)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS attendance_status TEXT;

-- 3. Create function to get user attended count
CREATE OR REPLACE FUNCTION get_user_attended_count(user_uuid UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)
    FROM bookings
    WHERE user_id = user_uuid
    AND attendance_status = 'attended'
  );
END;
$$ LANGUAGE plpgsql;

-- 4. Create function to get user attended events
CREATE OR REPLACE FUNCTION get_user_attended_events(user_uuid UUID)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  event_date TIMESTAMPTZ,
  event_location TEXT,
  booked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id AS event_id,
    e.title AS event_title,
    e.date AS event_date,
    e.location AS event_location,
    b.booked_at AS booked_at
  FROM bookings b
  INNER JOIN events e ON b.event_id = e.id
  WHERE b.user_id = user_uuid
  AND b.attendance_status = 'attended'
  ORDER BY b.booked_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Note: The application code uses direct queries instead of these functions
-- for better flexibility, but these functions are available if needed.

-- ============================================
-- Event Enhancements Migration
-- ============================================

-- 5. Add theme column to events table (optional)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS theme TEXT;

-- 6. Add registration_opens_at column to events table
-- NULL means registration is open immediately
ALTER TABLE events
ADD COLUMN IF NOT EXISTS registration_opens_at TIMESTAMPTZ;

-- 7. Add host_user_id column to events table
-- References profiles.id, NULL means no host assigned (TBD)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS host_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- 7b. Add created_by column to events table
-- Tracks which user (event creator) created the event
ALTER TABLE events
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);

-- Optional: Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_events_registration_opens_at ON events(registration_opens_at);
CREATE INDEX IF NOT EXISTS idx_events_host_user_id ON events(host_user_id);

-- ============================================
-- User Roles Migration
-- ============================================

-- 8. Add role column to profiles table
-- Default role is 'performer', can be 'event_creator' or 'admin'
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'performer' CHECK (role IN ('performer', 'event_creator', 'admin'));

-- Update existing users: if they're in admin_users table, set role to 'admin'
UPDATE profiles
SET role = 'admin'
WHERE id IN (SELECT user_id FROM admin_users);

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============================================
-- Role Change Requests System
-- ============================================

-- 9. Create role_change_requests table
-- Tracks user requests to become event creators
CREATE TABLE IF NOT EXISTS role_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('event_creator', 'admin')),
  from_role TEXT NOT NULL CHECK (from_role IN ('performer', 'event_creator', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT,
  admin_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for role_change_requests
CREATE INDEX IF NOT EXISTS idx_role_change_requests_user_id ON role_change_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_status ON role_change_requests(status);
CREATE INDEX IF NOT EXISTS idx_role_change_requests_reviewed_by ON role_change_requests(reviewed_by);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_role_change_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on role_change_requests
CREATE TRIGGER trigger_update_role_change_requests_updated_at
BEFORE UPDATE ON role_change_requests
FOR EACH ROW
EXECUTE FUNCTION update_role_change_requests_updated_at();
