-- ============================================================
-- Event Creator Invite Flow Migration
-- ============================================================

-- 1. Expand events status constraint to include pending_approval
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('active', 'cancelled', 'pending_approval'));

-- 2. Add status, requested_by, community_id to venues
ALTER TABLE venues ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved'
  CHECK (status IN ('approved', 'pending', 'rejected'));
ALTER TABLE venues ADD COLUMN IF NOT EXISTS requested_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE SET NULL;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

-- Create index for pending venues
CREATE INDEX IF NOT EXISTS idx_venues_status ON venues(status);
CREATE INDEX IF NOT EXISTS idx_venues_community ON venues(community_id);

-- Allow authenticated users to see approved venues (existing policy covers this)
-- Also allow authenticated users to see pending venues they requested
-- (service role handles inserts and status updates via API routes)

-- 3. Create community_invite_links table
CREATE TABLE IF NOT EXISTS community_invite_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  target_role TEXT NOT NULL DEFAULT 'event_creator'
                CHECK (target_role IN ('member', 'event_creator', 'co_admin')),
  max_uses    INTEGER NOT NULL DEFAULT 50,
  uses        INTEGER NOT NULL DEFAULT 0,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_invite_links_token ON community_invite_links(token);

ALTER TABLE community_invite_links ENABLE ROW LEVEL SECURITY;

-- Community admins/co-admins and super admins can view their own links
CREATE POLICY "community_invite_links_select"
  ON community_invite_links FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_invite_links.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'co_admin')
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
  );

-- 4. Extend notification types for new flows
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
    'venue_rejected'
  )
);
