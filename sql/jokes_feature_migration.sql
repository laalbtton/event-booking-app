-- ============================================================
-- Jokes feature: platform settings toggle + notification pref
-- Run this in the Supabase SQL editor
-- ============================================================

-- ── platform_settings ────────────────────────────────────────
-- Single-row table for platform-wide feature toggles.
-- The CHECK constraint ensures only one row can ever exist.

CREATE TABLE IF NOT EXISTS platform_settings (
  id                  INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  jokes_tab_enabled   BOOLEAN     NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the default row
INSERT INTO platform_settings (id, jokes_tab_enabled)
VALUES (1, true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

-- Public read so the nav tab can check the flag without auth
CREATE POLICY "platform_settings: public read"
  ON platform_settings FOR SELECT USING (true);

-- Only platform admins can change it
CREATE POLICY "platform_settings: admin update"
  ON platform_settings FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    OR EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid())
  );

-- ── push_notification_prefs: jokes column ────────────────────

ALTER TABLE push_notification_prefs
  ADD COLUMN IF NOT EXISTS jokes_notifications_enabled BOOLEAN NOT NULL DEFAULT true;
