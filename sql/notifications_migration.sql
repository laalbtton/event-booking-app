-- Database Migration: Notifications System
-- This file contains SQL statements to create the notifications table
-- for storing user notifications about booking changes, waitlist updates, etc.

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('waitlist_promoted', 'waitlist_position_changed', 'waitlist_position_improved', 'booking_confirmed', 'booking_cancelled', 'event_updated', 'event_reminder', 'general')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT FALSE,
  related_booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  related_event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

-- Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own notifications
CREATE POLICY "Users can view their own notifications"
ON notifications
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (mark as read)
CREATE POLICY "Users can update their own notifications"
ON notifications
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: System can insert notifications for users
-- Note: This allows the application to create notifications via a function
-- For client-side inserts, we'll use a SECURITY DEFINER function
CREATE POLICY "Users can insert their own notifications"
ON notifications
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Function to create a notification (can be called from client or server)
CREATE OR REPLACE FUNCTION create_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_message TEXT,
  p_related_booking_id UUID DEFAULT NULL,
  p_related_event_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, message, related_booking_id, related_event_id)
  VALUES (p_user_id, p_type, p_title, p_message, p_related_booking_id, p_related_event_id)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION create_notification(UUID, TEXT, TEXT, TEXT, UUID, UUID) TO authenticated;
