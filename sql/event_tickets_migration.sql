-- Event tickets (single-tier to start)
CREATE TABLE IF NOT EXISTS event_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_cents integer NOT NULL,
  quantity integer NOT NULL,
  sold integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS event_tickets_event_id_unique ON event_tickets(event_id);

ALTER TABLE event_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_tickets_read" ON event_tickets
  FOR SELECT USING (true);

CREATE POLICY "event_tickets_manage" ON event_tickets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_tickets.event_id
        AND (events.created_by = auth.uid() OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()))
    )
  );
