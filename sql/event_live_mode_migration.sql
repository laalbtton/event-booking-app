-- ============================================================
-- Event Live Mode
-- Host marks one live performer; attendees cast green/red votes.
-- Run this in the Supabase SQL editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_live_state (
  event_id               UUID PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  live_performer_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by             UUID REFERENCES public.profiles(id),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.event_performer_votes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  voter_user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  performer_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote               TEXT NOT NULL CHECK (vote IN ('green', 'red')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, voter_user_id, performer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_performer_votes_event_id
  ON public.event_performer_votes(event_id);

CREATE INDEX IF NOT EXISTS idx_event_performer_votes_performer
  ON public.event_performer_votes(event_id, performer_user_id);

ALTER TABLE public.event_live_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_performer_votes ENABLE ROW LEVEL SECURITY;

-- Confirmed attendees (and host) can read live state
DROP POLICY IF EXISTS "event_live_state: attendees read" ON public.event_live_state;
CREATE POLICY "event_live_state: attendees read"
  ON public.event_live_state
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_live_state.event_id
        AND e.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = event_live_state.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Host / admin can upsert live state
DROP POLICY IF EXISTS "event_live_state: host write" ON public.event_live_state;
CREATE POLICY "event_live_state: host write"
  ON public.event_live_state
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_live_state.event_id
        AND e.host_user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_live_state.event_id
        AND e.host_user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Voters manage their own votes; confirmed attendees / host can read
DROP POLICY IF EXISTS "event_performer_votes: voter own" ON public.event_performer_votes;
CREATE POLICY "event_performer_votes: voter own"
  ON public.event_performer_votes
  FOR ALL
  USING (voter_user_id = auth.uid())
  WITH CHECK (voter_user_id = auth.uid());

DROP POLICY IF EXISTS "event_performer_votes: attendees read" ON public.event_performer_votes;
CREATE POLICY "event_performer_votes: attendees read"
  ON public.event_performer_votes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = event_performer_votes.event_id
        AND e.host_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.event_id = event_performer_votes.event_id
        AND b.user_id = auth.uid()
        AND b.status = 'confirmed'
    )
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.event_live_state IS 'Which performer is currently live on stage for an event (at most one).';
COMMENT ON TABLE public.event_performer_votes IS 'Audience green/red reactions for performers during Live Mode.';
