-- ============================================================
-- Follow feature: user-to-user follow graph + feed support
-- Run this in the Supabase SQL editor
--
-- Design notes:
--   * One-way follow (no approval), like following a performer.
--   * Follower COUNTS are deliberately NOT exposed publicly — we do not
--     want follower count to become the metric people judge comics by.
--     RLS below only lets you read rows where you are the follower or
--     the followed person; aggregate counts are never served to others.
-- ============================================================

CREATE TABLE IF NOT EXISTS profile_follows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CONSTRAINT profile_follows_no_self CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_follows_follower  ON profile_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_profile_follows_following ON profile_follows(following_id);

ALTER TABLE profile_follows ENABLE ROW LEVEL SECURITY;

-- You can read a follow row only if you are one of the two parties.
-- This prevents any client from counting someone else's followers.
DROP POLICY IF EXISTS "profile_follows_select_own" ON profile_follows;
CREATE POLICY "profile_follows_select_own"
  ON profile_follows FOR SELECT
  TO authenticated
  USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Users may follow / unfollow for themselves only.
DROP POLICY IF EXISTS "profile_follows_insert_own" ON profile_follows;
CREATE POLICY "profile_follows_insert_own"
  ON profile_follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "profile_follows_delete_own" ON profile_follows;
CREATE POLICY "profile_follows_delete_own"
  ON profile_follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);

-- ── push_notification_prefs: follow updates category ─────────
-- Opt-out (default true), consistent with the other categories.

ALTER TABLE push_notification_prefs
  ADD COLUMN IF NOT EXISTS follow_updates_enabled BOOLEAN NOT NULL DEFAULT true;

-- ── notifications: new type values ───────────────────────────

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
    'chat_message',
    'host_poster_reminder_5d',
    'host_poster_reminder_24h',
    'post_event_feedback',
    'post_event_review_prompt',
    'review_reward',
    'profile_review_received',
    'weekly_digest',
    'referral_credit_earned',
    'red_button_credits_earned',
    'red_button_lucky_draw_won',
    'new_follower',
    'followed_user_event'
  )
);
