-- SELECT on chat messages (Realtime + polling):
-- - Platform event_creator / admin: read any event's chat (no booking required).
-- - Host / event creator: read their events.
-- - Signed-up performers on that event: confirmed or waitlist, non-audience (read-only for waitlist in app logic).
--
-- Run in Supabase SQL editor after event_chat_migration.sql (replaces prior chat_select_performers).

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
        AND b.status IN ('confirmed', 'waitlist')
        AND b.booking_scope IS DISTINCT FROM 'audience'
    )
    OR EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_chat_messages.event_id
        AND (e.host_user_id = auth.uid() OR e.created_by = auth.uid())
    )
  );
