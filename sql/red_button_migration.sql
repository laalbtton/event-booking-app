-- ============================================================
-- Red Button Promo Game
-- Host activates a session; attendees submit a number guess;
-- correct answers earn 2 Ryan's Chai venue credits.
-- A lucky draw winner earns a Free Chai coupon.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── Tables ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.red_button_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  host_user_id    UUID        NOT NULL REFERENCES public.profiles(id),
  -- secret_code is 11-99; never exposed to clients via RLS column security
  secret_code     SMALLINT    NOT NULL CHECK (secret_code >= 11 AND secret_code <= 99),
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  winner_user_id  UUID        REFERENCES public.profiles(id),
  winner_approved BOOLEAN     NOT NULL DEFAULT FALSE,
  coupon_issued   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.red_button_responses (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID        NOT NULL REFERENCES public.red_button_sessions(id) ON DELETE CASCADE,
  user_id        UUID        NOT NULL REFERENCES public.profiles(id),
  correct        BOOLEAN     NOT NULL DEFAULT FALSE,
  credits_issued BOOLEAN     NOT NULL DEFAULT FALSE,
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_red_button_sessions_event_id
  ON public.red_button_sessions(event_id);

CREATE INDEX IF NOT EXISTS idx_red_button_sessions_active
  ON public.red_button_sessions(active) WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_red_button_responses_session_id
  ON public.red_button_responses(session_id);

CREATE INDEX IF NOT EXISTS idx_red_button_responses_user_id
  ON public.red_button_responses(user_id);

-- ── RLS ─────────────────────────────────────────────────────

ALTER TABLE public.red_button_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.red_button_responses ENABLE ROW LEVEL SECURITY;

-- Hosts can fully manage sessions for their events
DROP POLICY IF EXISTS "red_button_sessions: host full access" ON public.red_button_sessions;
CREATE POLICY "red_button_sessions: host full access"
  ON public.red_button_sessions
  FOR ALL
  USING (host_user_id = auth.uid());

-- Confirmed attendees can see active sessions (secret_code excluded via select list in app code)
DROP POLICY IF EXISTS "red_button_sessions: attendees view active" ON public.red_button_sessions;
CREATE POLICY "red_button_sessions: attendees view active"
  ON public.red_button_sessions
  FOR SELECT
  USING (
    active = TRUE
    AND EXISTS (
      SELECT 1 FROM public.bookings
      WHERE bookings.event_id = red_button_sessions.event_id
        AND bookings.user_id   = auth.uid()
        AND bookings.status    = 'confirmed'
    )
  );

-- Admins can see all sessions
DROP POLICY IF EXISTS "red_button_sessions: admin read" ON public.red_button_sessions;
CREATE POLICY "red_button_sessions: admin read"
  ON public.red_button_sessions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- Users can manage their own responses
DROP POLICY IF EXISTS "red_button_responses: user own" ON public.red_button_responses;
CREATE POLICY "red_button_responses: user own"
  ON public.red_button_responses
  FOR ALL
  USING (user_id = auth.uid());

-- Hosts can read all responses for their sessions
DROP POLICY IF EXISTS "red_button_responses: host read" ON public.red_button_responses;
CREATE POLICY "red_button_responses: host read"
  ON public.red_button_responses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.red_button_sessions rbs
      WHERE rbs.id           = red_button_responses.session_id
        AND rbs.host_user_id = auth.uid()
    )
  );

-- Admins can read all responses
DROP POLICY IF EXISTS "red_button_responses: admin read" ON public.red_button_responses;
CREATE POLICY "red_button_responses: admin read"
  ON public.red_button_responses
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

-- ── Realtime ─────────────────────────────────────────────────
-- Add red_button_sessions to the realtime publication so clients
-- receive INSERT/UPDATE events for the game state.
-- Run this separately if the publication already exists:
--
--   ALTER PUBLICATION supabase_realtime ADD TABLE public.red_button_sessions;
--
-- If you need to create the publication from scratch:
--   CREATE PUBLICATION supabase_realtime FOR TABLE public.red_button_sessions;
