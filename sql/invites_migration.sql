-- Event invites for booked shows
CREATE TABLE IF NOT EXISTS event_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  invited_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE event_invites
ADD CONSTRAINT event_invites_status_check
CHECK (status IN ('pending', 'accepted', 'declined'));

CREATE UNIQUE INDEX IF NOT EXISTS event_invites_unique
  ON event_invites(event_id, invited_user_id);

ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;

-- Invited users can view their own invites
CREATE POLICY "invites_view_own"
  ON event_invites
  FOR SELECT
  USING (auth.uid() = invited_user_id);

-- Event creators/admins/hosts can view invites for their events
CREATE POLICY "invites_manage_event"
  ON event_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = event_invites.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
  );
