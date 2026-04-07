-- Host poster share reminders (in-app + push targets hosting checklist)
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (
  type IN (
    'waitlist_promoted',
    'waitlist_position_changed',
    'waitlist_position_improved',
    'booking_confirmed',
    'booking_cancelled',
    'event_updated',
    'event_reminder',
    'general',
    'event_creator_request',
    'community_creation_request',
    'community_event_creator_request',
    'cross_community_submission',
    'event_pending_approval',
    'venue_pending_approval',
    'event_approved',
    'event_rejected',
    'venue_approved',
    'venue_rejected',
    'chat_message',
    'host_poster_reminder_5d',
    'host_poster_reminder_24h'
  )
);
