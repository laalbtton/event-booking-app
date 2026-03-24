-- Allow confirmed performers for the event to SELECT chat messages (Realtime + direct queries).
-- Run in Supabase SQL editor after event_chat_migration.sql.
-- Fixes: users with platform role "audience" but a performer booking could not read/subscribe before.

DROP POLICY IF EXISTS "chat_select_performers" ON event_chat_messages;

CREATE POLICY "chat_select_performers"
  ON event_chat_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('event_creator', 'admin')
    )
    OR EXISTS (
      SELECT 1 FROM bookings b
      WHERE b.event_id = event_chat_messages.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
        AND b.booking_scope = 'performer'
    )
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_chat_messages.event_id
        AND (e.host_user_id = auth.uid() OR e.created_by = auth.uid())
    )
  );
