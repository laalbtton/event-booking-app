-- ============================================================
-- Event Chat Migration
-- ============================================================

-- 1. Add chat columns to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS chat_mode TEXT NOT NULL DEFAULT 'open'
  CHECK (chat_mode IN ('open', 'host_only'));

-- 2. Event chat messages table
CREATE TABLE IF NOT EXISTS event_chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 1000),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_chat_event_id ON event_chat_messages(event_id, created_at DESC);

ALTER TABLE event_chat_messages ENABLE ROW LEVEL SECURITY;

-- Any signed-in performer-role user can read messages (for Realtime to work).
-- Sending is enforced at the API layer (requires confirmed booking for that event).
CREATE POLICY "chat_select_performers"
  ON event_chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('event_creator', 'admin')
    )
  );
-- All inserts/deletes go through service-role API routes (bypasses RLS)

-- 3. Per-user notification preferences for chat
CREATE TABLE IF NOT EXISTS event_chat_notification_prefs (
  user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  enabled  BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, event_id)
);

ALTER TABLE event_chat_notification_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "chat_notif_pref_own"
  ON event_chat_notification_prefs FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4. Extend notification type constraint to include chat_message
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
    'chat_message'
  )
);

-- 5. Enable Realtime replication for the new table
ALTER PUBLICATION supabase_realtime ADD TABLE event_chat_messages;

-- 6. Cleanup function — deletes messages for events older than 30 days
--    Call manually or via a scheduled Supabase Edge Function / pg_cron job.
CREATE OR REPLACE FUNCTION cleanup_old_chat_messages()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  DELETE FROM event_chat_messages ecm
  USING events e
  WHERE ecm.event_id = e.id
    AND e.date < NOW() - INTERVAL '30 days';
$$;
