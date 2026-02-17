-- ============================================
-- Food coupon model for event bookings
-- ============================================
-- Business goal:
-- - Support split booking economics, e.g. 10 credits total:
--   - 5 credits = performer spot fee
--   - 5 credits = venue food coupon value
--
-- Notes:
-- - This migration only adds schema + RLS scaffolding.
-- - Issuance/refund/redemption orchestration should run via API routes
--   (server-side), not direct client writes.

-- ------------------------------------------------
-- events: coupon configuration
-- ------------------------------------------------
ALTER TABLE events
ADD COLUMN IF NOT EXISTS food_coupon_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS spot_fee_credits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS food_coupon_value_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE events
ADD COLUMN IF NOT EXISTS food_coupon_expires_hours INTEGER NOT NULL DEFAULT 24;

ALTER TABLE events
ADD CONSTRAINT events_spot_fee_credits_non_negative
CHECK (spot_fee_credits >= 0);

ALTER TABLE events
ADD CONSTRAINT events_food_coupon_value_cents_non_negative
CHECK (food_coupon_value_cents >= 0);

ALTER TABLE events
ADD CONSTRAINT events_food_coupon_expires_hours_positive
CHECK (food_coupon_expires_hours > 0);

COMMENT ON COLUMN events.food_coupon_enabled IS 'If true, booking can issue a venue coupon voucher';
COMMENT ON COLUMN events.spot_fee_credits IS 'Credits consumed as performer spot fee component';
COMMENT ON COLUMN events.food_coupon_value_cents IS 'Coupon face value in cents (CAD)';
COMMENT ON COLUMN events.food_coupon_expires_hours IS 'Voucher expires X hours after booking/event start based on app logic';

-- ------------------------------------------------
-- booking_vouchers: issued coupon tied to booking
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS booking_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  value_cents INTEGER NOT NULL CHECK (value_cents >= 0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'redeemed', 'cancelled', 'expired')),
  expires_at TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  redeemed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS booking_vouchers_event_id_idx ON booking_vouchers(event_id);
CREATE INDEX IF NOT EXISTS booking_vouchers_user_id_idx ON booking_vouchers(user_id);
CREATE INDEX IF NOT EXISTS booking_vouchers_status_idx ON booking_vouchers(status);
CREATE INDEX IF NOT EXISTS booking_vouchers_venue_id_idx ON booking_vouchers(venue_id);

-- ------------------------------------------------
-- voucher_redemptions: immutable audit entries
-- ------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID NOT NULL UNIQUE REFERENCES booking_vouchers(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  redeemed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  order_total_cents INTEGER CHECK (order_total_cents >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS voucher_redemptions_event_id_idx ON voucher_redemptions(event_id);
CREATE INDEX IF NOT EXISTS voucher_redemptions_user_id_idx ON voucher_redemptions(user_id);

-- ------------------------------------------------
-- Trigger helper: keep updated_at current
-- ------------------------------------------------
CREATE OR REPLACE FUNCTION set_booking_vouchers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS booking_vouchers_set_updated_at ON booking_vouchers;
CREATE TRIGGER booking_vouchers_set_updated_at
BEFORE UPDATE ON booking_vouchers
FOR EACH ROW
EXECUTE FUNCTION set_booking_vouchers_updated_at();

-- ------------------------------------------------
-- RLS
-- ------------------------------------------------
ALTER TABLE booking_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own vouchers
DROP POLICY IF EXISTS "booking_vouchers_select_own" ON booking_vouchers;
CREATE POLICY "booking_vouchers_select_own"
  ON booking_vouchers
  FOR SELECT
  USING (auth.uid() = user_id);

-- Event managers and admins can view vouchers for their events
DROP POLICY IF EXISTS "booking_vouchers_select_event_manager" ON booking_vouchers;
CREATE POLICY "booking_vouchers_select_event_manager"
  ON booking_vouchers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()
    )
  );

-- Event managers/admins can update voucher status (redeem/cancel/expire)
DROP POLICY IF EXISTS "booking_vouchers_update_event_manager" ON booking_vouchers;
CREATE POLICY "booking_vouchers_update_event_manager"
  ON booking_vouchers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = booking_vouchers.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()
    )
  );

-- Voucher redemption logs: visible to owner + event managers + admins
DROP POLICY IF EXISTS "voucher_redemptions_select_scope" ON voucher_redemptions;
CREATE POLICY "voucher_redemptions_select_scope"
  ON voucher_redemptions
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = voucher_redemptions.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()
    )
  );

-- Voucher redemption logs insert only by event managers/admins
DROP POLICY IF EXISTS "voucher_redemptions_insert_event_manager" ON voucher_redemptions;
CREATE POLICY "voucher_redemptions_insert_event_manager"
  ON voucher_redemptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM events
      WHERE events.id = voucher_redemptions.event_id
        AND (
          events.created_by = auth.uid()
          OR events.host_user_id = auth.uid()
        )
    )
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()
    )
  );

