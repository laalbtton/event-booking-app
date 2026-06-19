-- =============================================================
-- Profile reviews v2: anonymous feedback + review notifications
--
-- Run this AFTER profile_reviews_migration.sql.
-- Safe to re-run: all statements are idempotent.
-- Run the entire file in one execution in the Supabase SQL editor.
-- =============================================================

-- 1. ADD is_anonymous COLUMN --------------------------------------
ALTER TABLE public.profile_reviews
  ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profile_reviews.is_anonymous IS
  'When true the review is private: only the reviewer and the ratee can read it. '
  'The ratee receives a notification but the reviewer identity is hidden.';

-- 2. UPDATE SELECT RLS POLICY ------------------------------------
-- Replace the open "true" policy with one that:
--   - Shows non-anonymous reviews to everyone (public)
--   - Shows anonymous reviews ONLY to the reviewer or the ratee
DROP POLICY IF EXISTS "profile_reviews_select_public" ON public.profile_reviews;
CREATE POLICY "profile_reviews_select_public"
  ON public.profile_reviews FOR SELECT
  USING (
    (NOT is_anonymous)
    OR (auth.uid() = reviewer_id)
    OR (auth.uid() = ratee_id)
  );

-- 3. UPDATE PUBLIC RPCs TO EXCLUDE ANONYMOUS REVIEWS -------------
-- get_profile_review_summary: only count public (non-anonymous) reviews
CREATE OR REPLACE FUNCTION public.get_profile_review_summary(p_ratee_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'avg',   (
      SELECT round(avg(rating)::numeric, 2)
      FROM public.profile_reviews
      WHERE ratee_id    = p_ratee_id
        AND NOT is_anonymous
    ),
    'count', (
      SELECT count(*)::int
      FROM public.profile_reviews
      WHERE ratee_id    = p_ratee_id
        AND NOT is_anonymous
    )
  );
$$;

-- get_profile_recent_written_reviews: only public reviews
CREATE OR REPLACE FUNCTION public.get_profile_recent_written_reviews(p_ratee_id uuid, p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH recent AS (
    SELECT
      pr.id,
      pr.rating,
      pr.comment,
      pr.created_at,
      p.full_name   AS reviewer_name,
      p.avatar_url  AS reviewer_avatar,
      e.title       AS event_title
    FROM public.profile_reviews pr
    LEFT JOIN public.profiles p  ON p.id  = pr.reviewer_id
    LEFT JOIN public.events   e  ON e.id  = pr.event_context_id
    WHERE pr.ratee_id    = p_ratee_id
      AND NOT pr.is_anonymous
      AND pr.comment IS NOT NULL
      AND btrim(pr.comment) <> ''
    ORDER BY pr.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 5), 1), 50)
  )
  SELECT coalesce(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'id',             r.id,
         'rating',         r.rating,
         'comment',        r.comment,
         'createdAt',      r.created_at,
         'reviewerName',   r.reviewer_name,
         'reviewerAvatar', r.reviewer_avatar,
         'eventTitle',     r.event_title
       ) ORDER BY r.created_at DESC
     ) FROM recent r
    ),
    '[]'::jsonb
  );
$$;

-- 4. NEW RPC: get_my_received_profile_reviews ---------------------
-- Used by the ratee on their own profile page to see ALL reviews
-- they have received (including anonymous ones).
-- Returns reviewer as "Anonymous" when is_anonymous = true.
-- SECURITY INVOKER: RLS already enforces ratee-only access for anonymous rows.
CREATE OR REPLACE FUNCTION public.get_my_received_profile_reviews(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH mine AS (
    SELECT
      pr.id,
      pr.rating,
      pr.comment,
      pr.is_anonymous,
      pr.created_at,
      pr.updated_at,
      CASE WHEN pr.is_anonymous THEN NULL ELSE p.full_name   END AS reviewer_name,
      CASE WHEN pr.is_anonymous THEN NULL ELSE p.avatar_url  END AS reviewer_avatar,
      e.title AS event_title
    FROM public.profile_reviews pr
    LEFT JOIN public.profiles p ON p.id = pr.reviewer_id
    LEFT JOIN public.events   e ON e.id = pr.event_context_id
    WHERE pr.ratee_id = auth.uid()
    ORDER BY pr.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 20), 1), 100)
  )
  SELECT coalesce(
    (SELECT jsonb_agg(
       jsonb_build_object(
         'id',             m.id,
         'rating',         m.rating,
         'comment',        m.comment,
         'isAnonymous',    m.is_anonymous,
         'createdAt',      m.created_at,
         'updatedAt',      m.updated_at,
         'reviewerName',   m.reviewer_name,
         'reviewerAvatar', m.reviewer_avatar,
         'eventTitle',     m.event_title
       ) ORDER BY m.created_at DESC
     ) FROM mine m
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_profile_review_summary(uuid)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_recent_written_reviews(uuid, int)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_received_profile_reviews(int)              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_profile_review_summary(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_recent_written_reviews(uuid, int)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_received_profile_reviews(int)           TO authenticated;

-- 5. EXTEND NOTIFICATION TYPE CONSTRAINT --------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
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
    'profile_review_received'
  )
);
