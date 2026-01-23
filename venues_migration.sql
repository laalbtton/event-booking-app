-- Database Migration: Venues System
-- This file contains SQL statements to create the venues table
-- for storing approved venues that can be selected when creating events

-- Create venues table
CREATE TABLE IF NOT EXISTS venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  parking_options TEXT, -- e.g., "Free parking", "Paid parking", "Street parking", "No parking"
  accessibility TEXT, -- e.g., "Wheelchair accessible", "Elevator access", "Accessible restrooms"
  food_drinks_available BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for venues
CREATE INDEX IF NOT EXISTS idx_venues_name ON venues(name);

-- Add venue_id column to events table (nullable for backward compatibility)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS venue_id UUID REFERENCES venues(id) ON DELETE SET NULL;

-- Create index for venue_id
CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id);

-- Enable RLS on venues table
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Policy: Everyone can view venues (for event creation)
CREATE POLICY "Everyone can view venues"
ON venues
FOR SELECT
TO authenticated
USING (true);

-- Policy: Only admins can insert venues
CREATE POLICY "Only admins can insert venues"
ON venues
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy: Only admins can update venues
CREATE POLICY "Only admins can update venues"
ON venues
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Policy: Only admins can delete venues
CREATE POLICY "Only admins can delete venues"
ON venues
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
