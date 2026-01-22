-- Database Migration: Registration Alerts
-- This file contains SQL statements to create the registration_alerts table
-- for storing user requests to be notified when event registration opens

-- Create registration_alerts table
CREATE TABLE IF NOT EXISTS registration_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  notified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

-- Create indexes for registration_alerts
CREATE INDEX IF NOT EXISTS idx_registration_alerts_user_id ON registration_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_registration_alerts_event_id ON registration_alerts(event_id);
CREATE INDEX IF NOT EXISTS idx_registration_alerts_notified ON registration_alerts(notified);
CREATE INDEX IF NOT EXISTS idx_registration_alerts_event_notified ON registration_alerts(event_id, notified);

-- Enable RLS on registration_alerts table
ALTER TABLE registration_alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own alerts
CREATE POLICY "Users can view their own alerts"
ON registration_alerts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can insert their own alerts
CREATE POLICY "Users can insert their own alerts"
ON registration_alerts
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own alerts
CREATE POLICY "Users can delete their own alerts"
ON registration_alerts
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
