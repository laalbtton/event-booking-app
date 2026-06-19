-- =============================================================
-- Profile reviews: one reviewer → one ratee, once per pair.
-- Audience members earn 2 credits on first submit; credits
-- are forfeited (reversed) on delete. Re-review after delete
-- is allowed but credits are never re-granted.
--
-- IMPORTANT: Paste & run this entire file in one execution
-- in the Supabase SQL editor. Do not split on semicolons.
-- =============================================================

-- 1. MAIN TABLE ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profile_reviews (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ratee_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating           smallint    NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment          text        CHECK (comment IS NULL OR char_length(comment) <= 2000),
  -- Which event verified the relationship. Required: reviewer + ratee must have
  -- had a confirmed booking at the same event at insert time (trigger-enforced).
  event_context_id uuid        REFERENCES public.events(id) ON DELETE SET NULL,
  -- Credit tracking: set to true when 2 credits have been granted for this
  -- reviewer→ratee pair. Persists even after deletion via the audit table
  -- so credits can never be re-earned for the same pair.
  credits_granted  boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_reviews_unique_pair UNIQUE (reviewer_id, ratee_id)
);

CREATE INDEX IF NOT EXISTS idx_profile_reviews_ratee       ON public.profile_reviews(ratee_id);
CREATE INDEX IF NOT EXISTS idx_profile_reviews_reviewer    ON public.profile_reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_profile_reviews_event       ON public.profile_reviews(event_context_id);
CREATE INDEX IF NOT EXISTS idx_profile_reviews_created     ON public.profile_reviews(created_at DESC);

-- 2. CREDIT-GRANT AUDIT -------------------------------------------
-- Keeps a permanent record of every (reviewer_id, ratee_id) pair that
-- was ever granted credits. Survives review deletion so re-review after
-- delete cannot re-earn.
CREATE TABLE IF NOT EXISTS public.profile_review_credit_grants (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_id  uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ratee_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  credits      smallint    NOT NULL DEFAULT 2,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  -- Set when the review is deleted and credits are reversed
  reversed_at  timestamptz,
  CONSTRAINT profile_review_credit_grants_unique_pair UNIQUE (reviewer_id, ratee_id)
);

CREATE INDEX IF NOT EXISTS idx_prcg_reviewer ON public.profile_review_credit_grants(reviewer_id);

-- 3. UPDATED_AT TRIGGER --------------------------------------------
CREATE OR REPLACE FUNCTION public.set_profile_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_reviews_updated_at ON public.profile_reviews;
CREATE TRIGGER trg_profile_reviews_updated_at
  BEFORE UPDATE ON public.profile_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_profile_reviews_updated_at();

-- 4. INSERT VALIDATION TRIGGER -------------------------------------
-- Enforces: no self-review, verified event relationship (shared confirmed booking),
-- and sets event_context_id automatically when one isn't supplied.
CREATE OR REPLACE FUNCTION public.profile_reviews_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_shared_event_id uuid;
BEGIN
  -- Block self-review
  IF NEW.reviewer_id = NEW.ratee_id THEN
    RAISE EXCEPTION 'You cannot review yourself';
  END IF;

  -- Resolve event context: if caller supplied one, verify it; otherwise
  -- pick the most recent shared confirmed event automatically.
  IF NEW.event_context_id IS NOT NULL THEN
    -- Verify reviewer had a confirmed booking at that event
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = NEW.event_context_id
        AND b.user_id  = NEW.reviewer_id
        AND b.status   = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'You did not attend this event';
    END IF;
    -- Verify ratee had a confirmed booking at that event
    IF NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = NEW.event_context_id
        AND b.user_id  = NEW.ratee_id
        AND b.status   = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'The person you are reviewing did not attend this event';
    END IF;
  ELSE
    -- Auto-resolve: find the most-recent event both attended
    v_shared_event_id := (
      SELECT r.event_id
      FROM public.bookings r
      INNER JOIN public.bookings w
        ON w.event_id = r.event_id
      WHERE r.user_id = NEW.reviewer_id
        AND r.status  = 'confirmed'
        AND w.user_id = NEW.ratee_id
        AND w.status  = 'confirmed'
      ORDER BY r.booked_at DESC
      LIMIT 1
    );

    IF v_shared_event_id IS NULL THEN
      RAISE EXCEPTION 'You must have attended the same event to review this person';
    END IF;

    NEW.event_context_id := v_shared_event_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_reviews_before_insert ON public.profile_reviews;
CREATE TRIGGER trg_profile_reviews_before_insert
  BEFORE INSERT ON public.profile_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.profile_reviews_before_insert();

-- 5. AFTER-INSERT: GRANT CREDITS TO AUDIENCE REVIEWERS ------------
-- Grants 2 credits if:
--   • reviewer role = 'audience'
--   • this (reviewer_id, ratee_id) pair has never been granted before
-- Uses an explicit lock on the audit row to prevent double-grant under
-- concurrent inserts.
CREATE OR REPLACE FUNCTION public.profile_reviews_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_role     text;
  v_already  uuid;
  v_credits  int;
BEGIN
  -- Only audience role earns credits
  v_role := (
    SELECT role FROM public.profiles WHERE id = NEW.reviewer_id LIMIT 1
  );

  IF v_role <> 'audience' THEN
    RETURN NEW;
  END IF;

  -- Check audit table: never re-grant for same pair
  v_already := (
    SELECT id
    FROM public.profile_review_credit_grants
    WHERE reviewer_id = NEW.reviewer_id
      AND ratee_id    = NEW.ratee_id
    LIMIT 1
  );

  IF v_already IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Grant 2 credits
  v_credits := 2;

  UPDATE public.profiles
  SET credits    = credits + v_credits,
      updated_at = now()
  WHERE id = NEW.reviewer_id;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, reference_id, notes
  ) VALUES (
    NEW.reviewer_id,
    v_credits,
    'review_reward',
    NEW.id,
    'Review reward for submitting a profile review'
  );

  INSERT INTO public.profile_review_credit_grants
    (reviewer_id, ratee_id, credits)
  VALUES
    (NEW.reviewer_id, NEW.ratee_id, v_credits);

  -- Mark the review row itself
  UPDATE public.profile_reviews
  SET credits_granted = true
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_reviews_after_insert ON public.profile_reviews;
CREATE TRIGGER trg_profile_reviews_after_insert
  AFTER INSERT ON public.profile_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.profile_reviews_after_insert();

-- 6. AFTER-DELETE: FORFEIT CREDITS --------------------------------
-- When a review is deleted, if credits were granted, deduct them.
-- Also marks the audit row as reversed so re-review earns nothing.
CREATE OR REPLACE FUNCTION public.profile_reviews_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_grant_id    uuid;
  v_credits     int;
  v_reversed_at timestamptz;
BEGIN
  IF NOT OLD.credits_granted THEN
    RETURN OLD;
  END IF;

  SELECT id, credits, reversed_at
  INTO v_grant_id, v_credits, v_reversed_at
  FROM public.profile_review_credit_grants
  WHERE reviewer_id = OLD.reviewer_id
    AND ratee_id    = OLD.ratee_id
  LIMIT 1;

  -- Only forfeit once per pair
  IF v_grant_id IS NULL OR v_reversed_at IS NOT NULL THEN
    RETURN OLD;
  END IF;

  -- Deduct credits (floor at 0)
  UPDATE public.profiles
  SET credits    = GREATEST(0, credits - v_credits),
      updated_at = now()
  WHERE id = OLD.reviewer_id;

  INSERT INTO public.credit_transactions (
    user_id, amount, transaction_type, reference_id, notes
  ) VALUES (
    OLD.reviewer_id,
    -v_credits,
    'review_reward_reversed',
    OLD.id,
    'Review reward reversed: review deleted'
  );

  UPDATE public.profile_review_credit_grants
  SET reversed_at = now()
  WHERE id = v_grant_id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_profile_reviews_after_delete ON public.profile_reviews;
CREATE TRIGGER trg_profile_reviews_after_delete
  AFTER DELETE ON public.profile_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.profile_reviews_after_delete();

-- 7. RLS ----------------------------------------------------------
ALTER TABLE public.profile_reviews               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_review_credit_grants  ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can read reviews (for public profiles)
DROP POLICY IF EXISTS "profile_reviews_select_public" ON public.profile_reviews;
CREATE POLICY "profile_reviews_select_public"
  ON public.profile_reviews FOR SELECT
  USING (true);

-- Authenticated users can insert their own reviews
DROP POLICY IF EXISTS "profile_reviews_insert_own" ON public.profile_reviews;
CREATE POLICY "profile_reviews_insert_own"
  ON public.profile_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- Reviewer can update their own review (change rating/comment)
DROP POLICY IF EXISTS "profile_reviews_update_own" ON public.profile_reviews;
CREATE POLICY "profile_reviews_update_own"
  ON public.profile_reviews FOR UPDATE
  TO authenticated
  USING  (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

-- Reviewer can delete their own review
DROP POLICY IF EXISTS "profile_reviews_delete_own" ON public.profile_reviews;
CREATE POLICY "profile_reviews_delete_own"
  ON public.profile_reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- Only service role sees credit grant audit rows (no user-facing select)
DROP POLICY IF EXISTS "prcg_select_own" ON public.profile_review_credit_grants;
CREATE POLICY "prcg_select_own"
  ON public.profile_review_credit_grants FOR SELECT
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- 8. PUBLIC RPC: per-ratee aggregates + recent reviews -------------
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
      WHERE ratee_id = p_ratee_id
    ),
    'count', (
      SELECT count(*)::int
      FROM public.profile_reviews
      WHERE ratee_id = p_ratee_id
    )
  );
$$;

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
    WHERE pr.ratee_id = p_ratee_id
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

REVOKE ALL ON FUNCTION public.get_profile_review_summary(uuid)                  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_recent_written_reviews(uuid, int)     FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_review_summary(uuid)               TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_recent_written_reviews(uuid, int)  TO anon, authenticated;

-- 9. NOTIFICATION TYPE EXTENSION ----------------------------------
-- Adds 'review_reward' to the notifications type constraint so in-app
-- notifications can be sent when credits are granted.
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
    'review_reward'
  )
);

COMMENT ON TABLE public.profile_reviews IS
  'Direct profile-to-profile reviews. One per (reviewer, ratee) pair ever. Audience reviewers earn 2 credits on first submit; credits are forfeited on delete.';

COMMENT ON TABLE public.profile_review_credit_grants IS
  'Permanent audit of credit grants for profile reviews. Survives review deletion to prevent re-earning on the same pair.';
