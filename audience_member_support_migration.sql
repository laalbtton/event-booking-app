-- ============================================
-- Audience member support (phase 1 core + phase 2 hooks)
-- ============================================

-- ------------------------------------------------
-- profiles: add audience role and free pass count
-- ------------------------------------------------
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS audience_free_passes_remaining INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('performer', 'audience', 'event_creator', 'admin'));

-- Existing users stay in performer/admin/event_creator flows.
UPDATE public.profiles
SET role = 'performer'
WHERE role IS NULL
   OR role NOT IN ('performer', 'audience', 'event_creator', 'admin');

-- Keep role-change history valid when from_role includes audience.
ALTER TABLE public.role_change_requests
DROP CONSTRAINT IF EXISTS role_change_requests_from_role_check;

ALTER TABLE public.role_change_requests
ADD CONSTRAINT role_change_requests_from_role_check
CHECK (from_role IN ('performer', 'audience', 'event_creator', 'admin'));

-- ------------------------------------------------
-- events: audience-specific attendance settings
-- ------------------------------------------------
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS audience_enabled BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS audience_capacity INTEGER NOT NULL DEFAULT 15;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS audience_deposit_credits INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS audience_attendance_open_before_minutes INTEGER NOT NULL DEFAULT 30;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS audience_attendance_cutoff_hours INTEGER NOT NULL DEFAULT 2;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_audience_deposit_credits_non_negative;

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_audience_capacity_non_negative;

ALTER TABLE public.events
ADD CONSTRAINT events_audience_capacity_non_negative
CHECK (audience_capacity >= 0);

ALTER TABLE public.events
ADD CONSTRAINT events_audience_deposit_credits_non_negative
CHECK (audience_deposit_credits >= 0);

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_audience_attendance_open_before_minutes_non_negative;

ALTER TABLE public.events
ADD CONSTRAINT events_audience_attendance_open_before_minutes_non_negative
CHECK (audience_attendance_open_before_minutes >= 0);

ALTER TABLE public.events
DROP CONSTRAINT IF EXISTS events_audience_attendance_cutoff_hours_non_negative;

ALTER TABLE public.events
ADD CONSTRAINT events_audience_attendance_cutoff_hours_non_negative
CHECK (audience_attendance_cutoff_hours >= 0);

-- ------------------------------------------------
-- bookings: scope, check-in code, attendance audit markers
-- ------------------------------------------------
ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS booking_scope TEXT NOT NULL DEFAULT 'performer';

ALTER TABLE public.bookings
DROP CONSTRAINT IF EXISTS bookings_booking_scope_check;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_booking_scope_check
CHECK (booking_scope IN ('performer', 'audience'));

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS audience_checkin_code TEXT;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS audience_deposit_returned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_scope_status ON public.bookings(booking_scope, status);
CREATE INDEX IF NOT EXISTS idx_bookings_event_scope_status ON public.bookings(event_id, booking_scope, status);
CREATE INDEX IF NOT EXISTS idx_bookings_attendance_marked_at ON public.bookings(attendance_marked_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_audience_checkin_code_unique
  ON public.bookings(audience_checkin_code)
  WHERE audience_checkin_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_events_audience_enabled_date ON public.events(audience_enabled, date);

-- ------------------------------------------------
-- RLS for audience-scoped reads/host management
-- ------------------------------------------------
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_select_event_manager ON public.bookings;
CREATE POLICY bookings_select_event_manager
ON public.bookings
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = bookings.event_id
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS bookings_update_event_manager ON public.bookings;
CREATE POLICY bookings_update_event_manager
ON public.bookings
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = bookings.event_id
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = bookings.event_id
      AND (
        e.created_by = auth.uid()
        OR e.host_user_id = auth.uid()
      )
  )
  OR EXISTS (
    SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid()
  )
);

-- ------------------------------------------------
-- Phase 2 hooks: minimal dispute scaffolding
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.attendance_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_status TEXT NOT NULL CHECK (requested_status IN ('attended')),
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_disputes_event_status
  ON public.attendance_disputes(event_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_disputes_user_status
  ON public.attendance_disputes(user_id, status);

CREATE OR REPLACE FUNCTION public.set_attendance_disputes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS attendance_disputes_set_updated_at ON public.attendance_disputes;
CREATE TRIGGER attendance_disputes_set_updated_at
BEFORE UPDATE ON public.attendance_disputes
FOR EACH ROW
EXECUTE FUNCTION public.set_attendance_disputes_updated_at();

ALTER TABLE public.attendance_disputes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_disputes_select_own ON public.attendance_disputes;
CREATE POLICY attendance_disputes_select_own
ON public.attendance_disputes
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS attendance_disputes_insert_own ON public.attendance_disputes;
CREATE POLICY attendance_disputes_insert_own
ON public.attendance_disputes
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS attendance_disputes_select_event_manager ON public.attendance_disputes;
CREATE POLICY attendance_disputes_select_event_manager
ON public.attendance_disputes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.events e
    WHERE e.id = attendance_disputes.event_id
      AND (e.created_by = auth.uid() OR e.host_user_id = auth.uid())
  )
  OR EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid())
);
