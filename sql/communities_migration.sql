-- ============================================================
-- Communities Platform Migration
-- ============================================================

-- ============================================================
-- 1. COMMUNITIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE,
  description   TEXT,
  location      TEXT,
  language      TEXT,
  avatar_url    TEXT,
  banner_url    TEXT,
  is_public     BOOLEAN NOT NULL DEFAULT true,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'archived')),
  cant_wait_count INTEGER NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_communities_status  ON communities(status);
CREATE INDEX IF NOT EXISTS idx_communities_slug    ON communities(slug);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- Public can read active public communities
CREATE POLICY "communities_select_public"
  ON communities FOR SELECT
  USING (is_public = true AND status = 'active');

-- Admins can read everything
CREATE POLICY "communities_select_admin"
  ON communities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid()
    )
  );

-- All mutations go through service role (API routes) — no direct client writes
-- (service role bypasses RLS)

-- ============================================================
-- 2. COMMUNITY MEMBERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member'
                  CHECK (role IN ('member', 'event_creator', 'co_admin', 'admin')),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_community ON community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user      ON community_members(user_id);
CREATE INDEX IF NOT EXISTS idx_community_members_role      ON community_members(community_id, role);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view memberships
CREATE POLICY "community_members_select_authenticated"
  ON community_members FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 3. COMMUNITY CREATION REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_creation_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  location     TEXT,
  language     TEXT,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  admin_notes  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_creation_requests_user   ON community_creation_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_community_creation_requests_status ON community_creation_requests(status);

ALTER TABLE community_creation_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "community_creation_requests_select_own"
  ON community_creation_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Super admins can see all
CREATE POLICY "community_creation_requests_select_admin"
  ON community_creation_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
  );

-- ============================================================
-- 4. COMMUNITY EVENT CREATOR REQUESTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS community_event_creator_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id  UUID NOT NULL REFERENCES communities(id)  ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES profiles(id)     ON DELETE CASCADE,
  message       TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_ec_requests_community ON community_event_creator_requests(community_id);
CREATE INDEX IF NOT EXISTS idx_community_ec_requests_user      ON community_event_creator_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_community_ec_requests_status    ON community_event_creator_requests(status);

ALTER TABLE community_event_creator_requests ENABLE ROW LEVEL SECURITY;

-- Users see their own requests
CREATE POLICY "community_ec_requests_select_own"
  ON community_event_creator_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Community admins / co-admins see requests for their community
CREATE POLICY "community_ec_requests_select_admin"
  ON community_event_creator_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_event_creator_requests.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'co_admin')
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
  );

-- ============================================================
-- 5. EVENT COMMUNITIES TABLE (event ↔ community link)
-- ============================================================
CREATE TABLE IF NOT EXISTS event_communities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id)      ON DELETE CASCADE,
  community_id  UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  status        TEXT NOT NULL DEFAULT 'approved'
                  CHECK (status IN ('approved', 'pending', 'rejected', 'expired')),
  submitted_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ DEFAULT NOW(),
  reviewed_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  UNIQUE(event_id, community_id)
);

CREATE INDEX IF NOT EXISTS idx_event_communities_event     ON event_communities(event_id);
CREATE INDEX IF NOT EXISTS idx_event_communities_community ON event_communities(community_id);
CREATE INDEX IF NOT EXISTS idx_event_communities_status    ON event_communities(community_id, status);

ALTER TABLE event_communities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_communities_select_all"
  ON event_communities FOR SELECT
  USING (true);

-- ============================================================
-- 6. EXTEND NOTIFICATION TYPES
-- ============================================================
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
    'cross_community_submission'
  )
);

-- ============================================================
-- 7. CANT_WAIT TRACKING TABLE (idempotent per user)
-- ============================================================
CREATE TABLE IF NOT EXISTS community_cant_wait_taps (
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id)    ON DELETE CASCADE,
  tapped_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_cant_wait_taps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cant_wait_select_admin"
  ON community_cant_wait_taps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM community_members cm
      WHERE cm.community_id = community_cant_wait_taps.community_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('admin', 'co_admin')
    )
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
    OR EXISTS (SELECT 1 FROM admin_users au WHERE au.user_id = auth.uid())
  );

-- ============================================================
-- 8. SEED: "GTA DESI COMEDY" COMMUNITY
-- ============================================================
DO $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Insert community
  INSERT INTO communities (name, description, status, is_public)
  VALUES ('GTA Desi Comedy', '', 'active', true)
  RETURNING id INTO v_community_id;

  -- Add all existing profiles as members;
  -- existing event_creator users become community event creators automatically
  INSERT INTO community_members (community_id, user_id, role)
  SELECT
    v_community_id,
    p.id,
    CASE
      WHEN p.role = 'admin'         THEN 'admin'
      WHEN p.role = 'event_creator' THEN 'event_creator'
      ELSE 'member'
    END
  FROM profiles p
  ON CONFLICT (community_id, user_id) DO NOTHING;

  -- Link all existing events to GTA Desi Comedy as primary (approved)
  INSERT INTO event_communities (event_id, community_id, is_primary, status, submitted_at)
  SELECT e.id, v_community_id, true, 'approved', NOW()
  FROM events e
  ON CONFLICT (event_id, community_id) DO NOTHING;

END $$;
