-- ============================================
-- RLS: Admin transactions visibility
-- ============================================
-- Purpose:
-- - Fix admin pages failing from recursive RLS on `profiles`.
-- - Keep admin read access for users, bookings, and transactions.
--
-- Root cause addressed:
-- - A policy on `profiles` that queries `profiles` in its own USING/WITH CHECK
--   can trigger: "infinite recursion detected in policy for relation profiles".
--
-- Safe approach here:
-- - `profiles` policies DO NOT query `profiles`.
-- - Admin detection in `profiles` policies uses `admin_users` only (non-recursive).
-- - Other table policies may check `profiles.role` since that is no longer recursive.

-- Ensure RLS is enabled on relevant tables
ALTER TABLE IF EXISTS public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- Drop potentially recursive/old policies so we can recreate cleanly
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

DROP POLICY IF EXISTS "bookings_select_admin" ON public.bookings;
DROP POLICY IF EXISTS "credit_transactions_select_admin" ON public.credit_transactions;
DROP POLICY IF EXISTS "credit_transactions_select_own" ON public.credit_transactions;

-- ------------------------------------------------
-- profiles policies (non-recursive)
-- ------------------------------------------------
CREATE POLICY "profiles_select_own"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "profiles_select_admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

CREATE POLICY "profiles_update_admin"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.admin_users au
    WHERE au.user_id = auth.uid()
  )
);

-- ------------------------------------------------
-- bookings policies
-- ------------------------------------------------
CREATE POLICY "bookings_select_admin"
ON public.bookings
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

-- ------------------------------------------------
-- credit_transactions policies
-- ------------------------------------------------
CREATE POLICY "credit_transactions_select_own"
ON public.credit_transactions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "credit_transactions_select_admin"
ON public.credit_transactions
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

