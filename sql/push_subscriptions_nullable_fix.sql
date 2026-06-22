-- Allow p256dh and auth to be NULL for native FCM subscriptions.
-- These columns are only needed for Web Push (VAPID) subscriptions;
-- Android / iOS FCM subscriptions use fcm_token instead and have no
-- p256dh / auth keys.

ALTER TABLE public.push_subscriptions
  ALTER COLUMN p256dh DROP NOT NULL,
  ALTER COLUMN auth   DROP NOT NULL;
