-- ============================================================
-- Optional performer sub-roles for comedy open mics
-- (and older open_mic rows that never received an open_mic_type).
--
-- A confirmed performer can take on one extra job at the event:
-- Time Keeper or Setup/Wrapup. Both are offered by default and the
-- host can switch either off from the manage attendees screen.
-- Claiming is first come first serve. Variety arts open mics are excluded.
--
-- Rows are created lazily: no row for an (event, role) pair means the
-- role is offered and unclaimed. That keeps "available by default"
-- true for every existing event without a backfill.
--
-- Run this in the Supabase SQL editor.
-- ============================================================

-- ── Table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.event_performer_roles (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  role_key         TEXT        NOT NULL CHECK (role_key IN ('time_keeper', 'setup_wrapup')),
  enabled          BOOLEAN     NOT NULL DEFAULT TRUE,
  assigned_user_id UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at      TIMESTAMPTZ,
  -- NULL when the performer claimed it themselves, otherwise the host who assigned it.
  assigned_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Set once the pre-event prompt has gone out, so the cron cannot notify twice.
  notified_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, role_key)
);

COMMENT ON TABLE public.event_performer_roles IS
  'Optional extra roles (time keeper, setup/wrapup) that a confirmed performer can take at a comedy open mic. A missing row means offered and unclaimed.';

-- ── Indexes ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_event_performer_roles_event_id
  ON public.event_performer_roles(event_id);

CREATE INDEX IF NOT EXISTS idx_event_performer_roles_assigned_user_id
  ON public.event_performer_roles(assigned_user_id)
  WHERE assigned_user_id IS NOT NULL;

-- Supports the pre-event notification sweep.
CREATE INDEX IF NOT EXISTS idx_event_performer_roles_unclaimed
  ON public.event_performer_roles(event_id)
  WHERE enabled = TRUE AND assigned_user_id IS NULL;

-- ── RLS ─────────────────────────────────────────────────────
-- Every mutation goes through /api/events/[id]/performer-roles using the
-- service role, which bypasses RLS. Clients only ever need to read: who
-- holds a role is already visible to anyone on the event page.

ALTER TABLE public.event_performer_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_performer_roles: authenticated read" ON public.event_performer_roles;
CREATE POLICY "event_performer_roles: authenticated read"
  ON public.event_performer_roles
  FOR SELECT
  TO authenticated
  USING (TRUE);

-- ── Atomic claim ────────────────────────────────────────────
-- First come first serve has to be settled inside one transaction, or two
-- performers tapping at the same moment both read "unclaimed" and both win.
--
-- A transaction-scoped advisory lock keyed on the event serialises every claim
-- for that event. Locking the single role row would be enough for two people
-- racing for the same role, but not for the "one role per person" rule, which
-- reads the sibling row — two simultaneous claims on different roles by the
-- same person could each miss the other. Locking per event covers both.
--
-- Eligibility is re-checked here rather than trusted from the caller, so the
-- API layer's checks exist only to produce friendlier messages.

CREATE OR REPLACE FUNCTION public.claim_event_performer_role(
  p_event_id UUID,
  p_role_key TEXT,
  p_user_id  UUID
)
RETURNS TABLE (claimed BOOLEAN, holder_user_id UUID, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holder  UUID;
  v_enabled BOOLEAN;
BEGIN
  IF p_role_key NOT IN ('time_keeper', 'setup_wrapup') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'unknown_role'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.event_type = 'open_mic'
      AND COALESCE(e.open_mic_type, 'comedy_open_mic') <> 'variety_arts_open_mic'
      AND COALESCE(e.status, 'active') = 'active'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'event_not_eligible'::TEXT;
    RETURN;
  END IF;

  -- Legacy bookings predate booking_scope and are performer rows.
  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.event_id = p_event_id
      AND b.user_id  = p_user_id
      AND b.status   = 'confirmed'
      AND COALESCE(b.booking_scope, 'performer') <> 'audience'
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'not_confirmed_performer'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event_performer_roles:' || p_event_id::TEXT));

  INSERT INTO public.event_performer_roles (event_id, role_key)
  VALUES (p_event_id, p_role_key)
  ON CONFLICT (event_id, role_key)
  DO UPDATE SET updated_at = event_performer_roles.updated_at
  RETURNING event_performer_roles.assigned_user_id, event_performer_roles.enabled
  INTO v_holder, v_enabled;

  IF NOT v_enabled THEN
    RETURN QUERY SELECT FALSE, v_holder, 'role_disabled'::TEXT;
    RETURN;
  END IF;

  IF v_holder IS NOT NULL THEN
    IF v_holder = p_user_id THEN
      RETURN QUERY SELECT TRUE, v_holder, 'already_holder'::TEXT;
    ELSE
      RETURN QUERY SELECT FALSE, v_holder, 'already_claimed'::TEXT;
    END IF;
    RETURN;
  END IF;

  -- One extra job per person, so the work gets spread around.
  IF EXISTS (
    SELECT 1 FROM public.event_performer_roles other
    WHERE other.event_id         = p_event_id
      AND other.role_key        <> p_role_key
      AND other.assigned_user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, 'holds_other_role'::TEXT;
    RETURN;
  END IF;

  UPDATE public.event_performer_roles
  SET assigned_user_id = p_user_id,
      assigned_at      = NOW(),
      assigned_by      = NULL,
      updated_at       = NOW()
  WHERE event_id = p_event_id
    AND role_key = p_role_key;

  RETURN QUERY SELECT TRUE, p_user_id, 'claimed'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.claim_event_performer_role IS
  'Atomically claims an optional performer role for a confirmed performer. Returns claimed=false with a reason when the slot is taken, disabled, or the caller is ineligible.';

-- ── Host assignment ─────────────────────────────────────────
-- The host can hand a role to any confirmed performer, or take it back, and may
-- override someone who already claimed it. This takes the same per-event
-- advisory lock as claiming so the "one role per person" rule still holds when
-- a host assigns at the same moment a performer claims.
--
-- Caller must already be authorised; permission is enforced in the API route
-- because it depends on community membership this function cannot see cheaply.
-- Pass p_user_id = NULL to clear the slot.

CREATE OR REPLACE FUNCTION public.assign_event_performer_role(
  p_event_id    UUID,
  p_role_key    TEXT,
  p_user_id     UUID,
  p_assigned_by UUID
)
RETURNS TABLE (ok BOOLEAN, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled BOOLEAN;
BEGIN
  IF p_role_key NOT IN ('time_keeper', 'setup_wrapup') THEN
    RETURN QUERY SELECT FALSE, 'unknown_role'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id = p_event_id
      AND e.event_type = 'open_mic'
      AND COALESCE(e.open_mic_type, 'comedy_open_mic') <> 'variety_arts_open_mic'
      AND COALESCE(e.status, 'active') = 'active'
  ) THEN
    RETURN QUERY SELECT FALSE, 'event_not_eligible'::TEXT;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('event_performer_roles:' || p_event_id::TEXT));

  IF p_user_id IS NULL THEN
    INSERT INTO public.event_performer_roles (event_id, role_key)
    VALUES (p_event_id, p_role_key)
    ON CONFLICT (event_id, role_key) DO UPDATE
    SET assigned_user_id = NULL,
        assigned_at      = NULL,
        assigned_by      = NULL,
        updated_at       = NOW();

    RETURN QUERY SELECT TRUE, 'cleared'::TEXT;
    RETURN;
  END IF;

  SELECT epr.enabled INTO v_enabled
  FROM public.event_performer_roles epr
  WHERE epr.event_id = p_event_id
    AND epr.role_key = p_role_key;

  -- A missing row means the role is offered by default.
  IF v_enabled IS NOT NULL AND NOT v_enabled THEN
    RETURN QUERY SELECT FALSE, 'role_disabled'::TEXT;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bookings b
    WHERE b.event_id = p_event_id
      AND b.user_id  = p_user_id
      AND b.status   = 'confirmed'
      AND COALESCE(b.booking_scope, 'performer') <> 'audience'
  ) THEN
    RETURN QUERY SELECT FALSE, 'not_confirmed_performer'::TEXT;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.event_performer_roles other
    WHERE other.event_id         = p_event_id
      AND other.role_key        <> p_role_key
      AND other.assigned_user_id = p_user_id
  ) THEN
    RETURN QUERY SELECT FALSE, 'holds_other_role'::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.event_performer_roles (event_id, role_key, assigned_user_id, assigned_at, assigned_by)
  VALUES (p_event_id, p_role_key, p_user_id, NOW(), p_assigned_by)
  ON CONFLICT (event_id, role_key) DO UPDATE
  SET assigned_user_id = EXCLUDED.assigned_user_id,
      assigned_at      = EXCLUDED.assigned_at,
      assigned_by      = EXCLUDED.assigned_by,
      updated_at       = NOW();

  RETURN QUERY SELECT TRUE, 'assigned'::TEXT;
END;
$$;

COMMENT ON FUNCTION public.assign_event_performer_role IS
  'Host-side assignment of an optional performer role. Pass p_user_id = NULL to clear. Authorisation is the caller''s responsibility.';

-- Mutations go through the service-role API only. Authenticated clients read
-- via RLS and claim/assign through /api/events/[id]/performer-roles. These
-- functions take a target user id, so they must not be callable by clients.
REVOKE ALL ON FUNCTION public.claim_event_performer_role(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assign_event_performer_role(UUID, TEXT, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_event_performer_role(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_event_performer_role(UUID, TEXT, UUID, UUID) TO service_role;
