ALTER TABLE public.push_notification_prefs
ADD COLUMN IF NOT EXISTS booking_updates_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.push_notification_prefs
ADD COLUMN IF NOT EXISTS event_reminders_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.push_notification_prefs
ADD COLUMN IF NOT EXISTS new_events_enabled BOOLEAN NOT NULL DEFAULT true;
