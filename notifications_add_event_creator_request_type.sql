-- Add 'event_creator_request' notification type for admin notifications
-- when someone submits a request to become an event creator

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'waitlist_promoted', 'waitlist_position_changed', 'waitlist_position_improved',
    'booking_confirmed', 'booking_cancelled', 'event_updated', 'event_reminder',
    'general', 'event_creator_request'
  ));
