-- Enable and configure RLS for role_change_requests
-- Fixes Supabase Security Advisor warning: "RLS Disabled in Public"

ALTER TABLE public.role_change_requests ENABLE ROW LEVEL SECURITY;

-- Users can view their own role requests.
DROP POLICY IF EXISTS role_change_requests_select_own ON public.role_change_requests;
CREATE POLICY role_change_requests_select_own
ON public.role_change_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can submit their own requests (pending only).
DROP POLICY IF EXISTS role_change_requests_insert_own ON public.role_change_requests;
CREATE POLICY role_change_requests_insert_own
ON public.role_change_requests
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

-- Admins can view all requests.
DROP POLICY IF EXISTS role_change_requests_select_admin ON public.role_change_requests;
CREATE POLICY role_change_requests_select_admin
ON public.role_change_requests
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);

-- Admins can review/update requests.
DROP POLICY IF EXISTS role_change_requests_update_admin ON public.role_change_requests;
CREATE POLICY role_change_requests_update_admin
ON public.role_change_requests
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  )
);
