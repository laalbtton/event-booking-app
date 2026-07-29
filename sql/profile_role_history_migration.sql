-- ============================================
-- profile_role_history: append-only role change log
-- ============================================
-- Run in Supabase SQL editor.
--
-- Captures performer/audience/event_creator/admin role changes via:
-- 1. apply_profile_role_change() RPC (settings + admin UI — explicit source)
-- 2. AFTER UPDATE trigger on profiles.role (all other direct UPDATE paths — source = 'system')
--
-- The trigger skips logging when the RPC already inserted a row within the last second
-- to avoid duplicate history entries.

CREATE TABLE IF NOT EXISTS public.profile_role_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_role TEXT NOT NULL,
  to_role TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'system'
    CHECK (source IN ('settings', 'admin', 'system')),
  notes TEXT NULL
);

CREATE INDEX IF NOT EXISTS profile_role_history_user_id_changed_at_idx
  ON public.profile_role_history (user_id, changed_at DESC);

COMMENT ON TABLE public.profile_role_history IS
  'Append-only audit log for profiles.role changes. Inserts via RPC or trigger only.';

ALTER TABLE public.profile_role_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_role_history_select_own ON public.profile_role_history;
CREATE POLICY profile_role_history_select_own
  ON public.profile_role_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS profile_role_history_select_admin ON public.profile_role_history;
CREATE POLICY profile_role_history_select_admin
  ON public.profile_role_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Inserts are performed by SECURITY DEFINER functions / service role, not direct client INSERT.

CREATE OR REPLACE FUNCTION public.apply_profile_role_change(
  p_user_id UUID,
  p_new_role TEXT,
  p_source TEXT DEFAULT 'system',
  p_changed_by UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_role TEXT;
  v_source TEXT;
  v_actor UUID;
  v_is_admin BOOLEAN;
BEGIN
  v_actor := auth.uid();
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_role NOT IN ('performer', 'audience', 'event_creator', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role;
  END IF;

  v_source := COALESCE(NULLIF(trim(p_source), ''), 'system');
  IF v_source NOT IN ('settings', 'admin', 'system') THEN
    RAISE EXCEPTION 'Invalid source: %', v_source;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = v_actor
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'admin'
  ) INTO v_is_admin;

  IF v_source = 'settings' THEN
    IF p_user_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    IF p_new_role NOT IN ('performer', 'audience') THEN
      RAISE EXCEPTION 'Settings can only switch between performer and audience';
    END IF;
  ELSIF v_source = 'admin' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
  ELSE
    RAISE EXCEPTION 'Unsupported source for RPC: %', v_source;
  END IF;

  SELECT role INTO v_old_role
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF v_source = 'settings' AND v_old_role NOT IN ('performer', 'audience') THEN
    RAISE EXCEPTION 'This account role cannot be switched from Settings';
  END IF;

  IF v_old_role IS DISTINCT FROM p_new_role THEN
    INSERT INTO public.profile_role_history (
      user_id,
      from_role,
      to_role,
      changed_by,
      source,
      notes
    ) VALUES (
      p_user_id,
      v_old_role,
      p_new_role,
      COALESCE(p_changed_by, v_actor),
      v_source,
      p_notes
    );

    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_profile_role_change(UUID, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_profile_role_change(UUID, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_profile_role_change(UUID, TEXT, TEXT, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.log_profile_role_change_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    -- Skip if apply_profile_role_change() already logged this change.
    IF NOT EXISTS (
      SELECT 1
      FROM public.profile_role_history h
      WHERE h.user_id = NEW.id
        AND h.from_role = OLD.role
        AND h.to_role = NEW.role
        AND h.changed_at > now() - interval '1 second'
    ) THEN
      INSERT INTO public.profile_role_history (
        user_id,
        from_role,
        to_role,
        changed_by,
        source,
        notes
      ) VALUES (
        NEW.id,
        OLD.role,
        NEW.role,
        NULL,
        'system',
        'Captured by profiles.role UPDATE trigger'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_role_history_trigger ON public.profiles;
CREATE TRIGGER profiles_role_history_trigger
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (OLD.role IS DISTINCT FROM NEW.role)
  EXECUTE FUNCTION public.log_profile_role_change_trigger();
