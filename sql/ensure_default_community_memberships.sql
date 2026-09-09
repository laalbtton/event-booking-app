-- ============================================================
-- Default public community memberships
--
-- If a user has zero rows in community_members, join them to
-- every public + active community as role = 'member'.
--
-- Covers signup paths that skip /onboarding/role (Google on
-- login, native Capacitor, email confirm → dashboard).
-- Does NOT add more communities if they already belong to any.
-- ============================================================

CREATE OR REPLACE FUNCTION public.ensure_default_community_memberships_for(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing integer;
  v_joined   integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM public.community_members
  WHERE user_id = p_user_id;

  IF v_existing > 0 THEN
    RETURN 0;
  END IF;

  INSERT INTO public.community_members (community_id, user_id, role)
  SELECT c.id, p_user_id, 'member'
  FROM public.communities c
  WHERE c.is_public = true
    AND c.status = 'active'
  ON CONFLICT (community_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_joined = ROW_COUNT;
  RETURN v_joined;
END;
$$;

COMMENT ON FUNCTION public.ensure_default_community_memberships_for(uuid) IS
  'If the user has no community memberships, join all public active communities.';

CREATE OR REPLACE FUNCTION public.ensure_default_community_memberships()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;
  RETURN public.ensure_default_community_memberships_for(auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profiles_ensure_default_communities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_default_community_memberships_for(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_ensure_default_communities ON public.profiles;

CREATE TRIGGER trg_profiles_ensure_default_communities
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_profiles_ensure_default_communities();

REVOKE ALL ON FUNCTION public.ensure_default_community_memberships_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_community_memberships_for(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_default_community_memberships() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_community_memberships() TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_default_community_memberships() TO service_role;

-- One-time backfill: existing profiles with no memberships
INSERT INTO public.community_members (community_id, user_id, role)
SELECT c.id, p.id, 'member'
FROM public.profiles p
CROSS JOIN public.communities c
WHERE c.is_public = true
  AND c.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_members cm
    WHERE cm.user_id = p.id
  )
ON CONFLICT (community_id, user_id) DO NOTHING;
