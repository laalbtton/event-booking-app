-- RLS Policies: Events table
-- Allow event creators and admins to create/update/delete their events

-- Ensure RLS is enabled
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Insert policy: event creators and admins can create events
CREATE POLICY "event_creators_and_admins_can_create_events"
ON events
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  AND (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('event_creator', 'admin')
    )
  )
);

-- Update policy: event creators can update their own events, admins can update all
CREATE POLICY "event_creators_and_admins_can_update_events"
ON events
FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Delete policy: event creators can delete their own events, admins can delete all
CREATE POLICY "event_creators_and_admins_can_delete_events"
ON events
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
