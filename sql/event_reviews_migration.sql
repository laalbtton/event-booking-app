-- Post-event reviews: one row per (event, reviewer) with three rating dimensions
-- and optional text. Snapshots of host / creator on submit for correct rollups.

-- Push prefs: opt-out for post-event review prompts
ALTER TABLE public.push_notification_prefs
ADD COLUMN IF NOT EXISTS post_event_reviews_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.event_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  comment text,
  host_rating smallint,
  creator_rating smallint,
  performance_rating smallint,
  performance_rated_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  snapshot_host_user_id uuid,
  snapshot_created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_reviews_unique_event_reviewer UNIQUE (event_id, reviewer_id),
  CONSTRAINT event_reviews_host_rating_check CHECK (host_rating IS NULL OR (host_rating >= 1 AND host_rating <= 5)),
  CONSTRAINT event_reviews_creator_rating_check CHECK (creator_rating IS NULL OR (creator_rating >= 1 AND creator_rating <= 5)),
  CONSTRAINT event_reviews_performance_rating_check CHECK (performance_rating IS NULL OR (performance_rating >= 1 AND performance_rating <= 5))
);

CREATE INDEX IF NOT EXISTS idx_event_reviews_performance_rated ON public.event_reviews(performance_rated_user_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_snapshot_host ON public.event_reviews(snapshot_host_user_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_snapshot_created ON public.event_reviews(snapshot_created_by);
CREATE INDEX IF NOT EXISTS idx_event_reviews_event_id ON public.event_reviews(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reviews_reviewer_id ON public.event_reviews(reviewer_id);

-- Updated_at
CREATE OR REPLACE FUNCTION public.set_event_reviews_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_reviews_updated_at ON public.event_reviews;
CREATE TRIGGER trg_event_reviews_updated_at
  BEFORE UPDATE ON public.event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.set_event_reviews_updated_at();

-- Validate and set snapshot IDs on insert/update
CREATE OR REPLACE FUNCTION public.event_reviews_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ev_end timestamptz;
  v_host uuid;
  v_created uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT
      coalesce(e.end_time, e.date::timestamptz),
      e.host_user_id,
      e.created_by
    INTO ev_end, v_host, v_created
    FROM public.events e
    WHERE e.id = NEW.event_id;

    IF ev_end IS NULL THEN
      RAISE EXCEPTION 'Event not found';
    END IF;

    IF ev_end >= now() THEN
      RAISE EXCEPTION 'Event has not ended yet';
    END IF;

    NEW.snapshot_host_user_id := v_host;
    NEW.snapshot_created_by := v_created;
  ELSE
    -- Preserve snapshots from first submit
    NEW.snapshot_host_user_id := COALESCE(OLD.snapshot_host_user_id, NEW.snapshot_host_user_id);
    NEW.snapshot_created_by := COALESCE(OLD.snapshot_created_by, NEW.snapshot_created_by);
    IF NEW.event_id IS DISTINCT FROM OLD.event_id THEN
      RAISE EXCEPTION 'Cannot change event on a review';
    END IF;
  END IF;

  SELECT
    e.host_user_id,
    e.created_by
  INTO v_host, v_created
  FROM public.events e
  WHERE e.id = NEW.event_id;

  IF v_host IS NULL AND NEW.host_rating IS NOT NULL THEN
    RAISE EXCEPTION 'No host to rate for this event';
  END IF;

  IF v_created IS NULL AND NEW.creator_rating IS NOT NULL THEN
    RAISE EXCEPTION 'No event creator to rate for this event';
  END IF;

  IF NEW.host_rating IS NOT NULL AND NEW.reviewer_id = v_host THEN
    RAISE EXCEPTION 'You cannot rate yourself as host';
  END IF;

  IF NEW.creator_rating IS NOT NULL AND NEW.reviewer_id = v_created THEN
    RAISE EXCEPTION 'You cannot rate yourself as event creator';
  END IF;

  IF NEW.performance_rating IS NOT NULL THEN
    IF NEW.performance_rated_user_id IS NULL THEN
      RAISE EXCEPTION 'Choose a performer for the performance rating';
    END IF;
    IF NEW.performance_rated_user_id = NEW.reviewer_id THEN
      RAISE EXCEPTION 'You cannot rate your own performance here';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.event_id = NEW.event_id
        AND b.user_id = NEW.performance_rated_user_id
        AND b.status = 'confirmed'
        AND (b.booking_scope = 'performer' OR b.booking_scope IS NULL)
    ) THEN
      RAISE EXCEPTION 'Performance rating must be for a confirmed performer on this event';
    END IF;
  ELSE
    NEW.performance_rated_user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_event_reviews_before_write ON public.event_reviews;
CREATE TRIGGER trg_event_reviews_before_write
  BEFORE INSERT OR UPDATE ON public.event_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.event_reviews_before_write();

ALTER TABLE public.event_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_reviews_select_own" ON public.event_reviews;
CREATE POLICY "event_reviews_select_own"
  ON public.event_reviews
  FOR SELECT
  TO authenticated
  USING (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "event_reviews_insert_participant" ON public.event_reviews;
CREATE POLICY "event_reviews_insert_participant"
  ON public.event_reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.event_id = event_reviews.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
  );

DROP POLICY IF EXISTS "event_reviews_update_own" ON public.event_reviews;
CREATE POLICY "event_reviews_update_own"
  ON public.event_reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

DROP POLICY IF EXISTS "event_reviews_delete_own" ON public.event_reviews;
CREATE POLICY "event_reviews_delete_own"
  ON public.event_reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- Public aggregates for profile pages (anon + authenticated, no direct table read)
CREATE OR REPLACE FUNCTION public.get_profile_rating_aggregates(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'performance', jsonb_build_object(
      'avg',
      (
        SELECT round(avg(er.performance_rating)::numeric, 2)
        FROM public.event_reviews er
        WHERE er.performance_rated_user_id = p_profile_id
          AND er.performance_rating IS NOT NULL
      ),
      'count',
      (
        SELECT count(*)::int
        FROM public.event_reviews er
        WHERE er.performance_rated_user_id = p_profile_id
          AND er.performance_rating IS NOT NULL
      )
    ),
    'hosting', jsonb_build_object(
      'avg',
      (
        SELECT round(avg(er.host_rating)::numeric, 2)
        FROM public.event_reviews er
        WHERE er.snapshot_host_user_id = p_profile_id
          AND er.host_rating IS NOT NULL
      ),
      'count',
      (
        SELECT count(*)::int
        FROM public.event_reviews er
        WHERE er.snapshot_host_user_id = p_profile_id
          AND er.host_rating IS NOT NULL
      )
    ),
    'event_creator', jsonb_build_object(
      'avg',
      (
        SELECT round(avg(er.creator_rating)::numeric, 2)
        FROM public.event_reviews er
        WHERE er.snapshot_created_by = p_profile_id
          AND er.creator_rating IS NOT NULL
      ),
      'count',
      (
        SELECT count(*)::int
        FROM public.event_reviews er
        WHERE er.snapshot_created_by = p_profile_id
          AND er.creator_rating IS NOT NULL
      )
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_profile_recent_review_snippets(p_profile_id uuid, p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT
      er.comment,
      e.title AS event_title,
      er.created_at
    FROM public.event_reviews er
    INNER JOIN public.events e ON e.id = er.event_id
    WHERE er.comment IS NOT NULL
      AND btrim(er.comment) <> ''
      AND (
        (er.performance_rated_user_id = p_profile_id AND er.performance_rating IS NOT NULL)
        OR (er.snapshot_host_user_id = p_profile_id AND er.host_rating IS NOT NULL)
        OR (er.snapshot_created_by = p_profile_id AND er.creator_rating IS NOT NULL)
      )
    ORDER BY er.created_at DESC
    LIMIT least(greatest(coalesce(p_limit, 5), 1), 20)
  )
  SELECT coalesce(
    (SELECT jsonb_agg(
        jsonb_build_object(
          'comment', r.comment,
          'eventTitle', r.event_title,
          'createdAt', r.created_at
        ) ORDER BY r.created_at DESC
     )
     FROM rows r
    ),
    '[]'::jsonb
  );
$$;

REVOKE ALL ON FUNCTION public.get_profile_rating_aggregates(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_profile_recent_review_snippets(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_rating_aggregates(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_recent_review_snippets(uuid, int) TO anon, authenticated;

COMMENT ON TABLE public.event_reviews IS 'Post-event reviews from confirmed bookers; snapshot_* preserve host/creator at submit time.';

-- In-app notification types for post-event flows
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
    'post_event_review_prompt'
  )
);
