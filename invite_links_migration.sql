-- Invite links for booked shows
CREATE TABLE IF NOT EXISTS event_invite_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 12,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_invite_links_event_id_idx
  ON event_invite_links(event_id);

ALTER TABLE event_invite_links ENABLE ROW LEVEL SECURITY;

-- Event creators/admins/hosts can view invite links for their events
CREATE POLICY "invite_links_manage_event"
  ON event_invite_links
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = event_invite_links.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
  );
