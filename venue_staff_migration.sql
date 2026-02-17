-- ============================================
-- Venue staff access model
-- ============================================
-- Purpose:
-- - Allow venues to designate staff members for coupon operations.
-- - Enable scoped redemption visibility and redemption actions by venue.

CREATE TABLE IF NOT EXISTS public.venue_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  staff_role TEXT NOT NULL DEFAULT 'cashier' CHECK (staff_role IN ('cashier', 'manager')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (venue_id, user_id)
);

CREATE INDEX IF NOT EXISTS venue_staff_venue_id_idx ON public.venue_staff(venue_id);
CREATE INDEX IF NOT EXISTS venue_staff_user_id_idx ON public.venue_staff(user_id);
CREATE INDEX IF NOT EXISTS venue_staff_active_idx ON public.venue_staff(active);

CREATE OR REPLACE FUNCTION public.set_venue_staff_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venue_staff_set_updated_at ON public.venue_staff;
CREATE TRIGGER venue_staff_set_updated_at
BEFORE UPDATE ON public.venue_staff
FOR EACH ROW
EXECUTE FUNCTION public.set_venue_staff_updated_at();

ALTER TABLE public.venue_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "venue_staff_select_scope" ON public.venue_staff;
CREATE POLICY "venue_staff_select_scope"
ON public.venue_staff
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

DROP POLICY IF EXISTS "venue_staff_modify_admin" ON public.venue_staff;
CREATE POLICY "venue_staff_modify_admin"
ON public.venue_staff
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  )
);

-- Expand voucher policies to include active venue staff for the voucher venue.
DROP POLICY IF EXISTS "booking_vouchers_select_event_manager" ON public.booking_vouchers;
CREATE POLICY "booking_vouchers_select_event_manager"
  ON public.booking_vouchers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.venue_staff vs
      WHERE vs.user_id = auth.uid()
        AND vs.venue_id = booking_vouchers.venue_id
        AND vs.active = true
    )
  );

DROP POLICY IF EXISTS "booking_vouchers_update_event_manager" ON public.booking_vouchers;
CREATE POLICY "booking_vouchers_update_event_manager"
  ON public.booking_vouchers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.venue_staff vs
      WHERE vs.user_id = auth.uid()
        AND vs.venue_id = booking_vouchers.venue_id
        AND vs.active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.venue_staff vs
      WHERE vs.user_id = auth.uid()
        AND vs.venue_id = booking_vouchers.venue_id
        AND vs.active = true
    )
  );

DROP POLICY IF EXISTS "voucher_redemptions_select_scope" ON public.voucher_redemptions;
CREATE POLICY "voucher_redemptions_select_scope"
  ON public.voucher_redemptions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = voucher_redemptions.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.venue_staff vs ON vs.venue_id = e.venue_id
      WHERE e.id = voucher_redemptions.event_id
        AND vs.user_id = auth.uid()
        AND vs.active = true
    )
  );

DROP POLICY IF EXISTS "voucher_redemptions_insert_event_manager" ON public.voucher_redemptions;
CREATE POLICY "voucher_redemptions_insert_event_manager"
  ON public.voucher_redemptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.events
      WHERE events.id = voucher_redemptions.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.events e
      JOIN public.venue_staff vs ON vs.venue_id = e.venue_id
      WHERE e.id = voucher_redemptions.event_id
        AND vs.user_id = auth.uid()
        AND vs.active = true
    )
  );
