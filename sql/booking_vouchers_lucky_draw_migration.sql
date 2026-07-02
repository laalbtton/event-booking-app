-- ============================================================
-- Booking Vouchers: Lucky Draw Extension
-- Makes booking_id nullable (lucky draw coupons have no booking)
-- and adds voucher_type to distinguish food coupons from prizes.
-- Run this in the Supabase SQL editor.
-- ============================================================

-- 1. Drop the existing NOT NULL constraint on booking_id
ALTER TABLE public.booking_vouchers
  ALTER COLUMN booking_id DROP NOT NULL;

-- 2. Add voucher_type column (defaults to existing food_coupon behaviour)
ALTER TABLE public.booking_vouchers
  ADD COLUMN IF NOT EXISTS voucher_type TEXT NOT NULL DEFAULT 'food_coupon';

COMMENT ON COLUMN public.booking_vouchers.voucher_type
  IS 'food_coupon = issued at booking time; lucky_draw = Red Button Promo winner prize';

-- 3. Replace the unique constraint on booking_id with a partial index
--    that only enforces uniqueness when booking_id IS NOT NULL.
--    (The old unique index name may vary; drop both common names to be safe.)
DROP INDEX IF EXISTS booking_vouchers_booking_id_key;
DROP INDEX IF EXISTS idx_booking_vouchers_booking_id;

CREATE UNIQUE INDEX IF NOT EXISTS booking_vouchers_booking_id_unique
  ON public.booking_vouchers(booking_id)
  WHERE booking_id IS NOT NULL;

-- 4. Add index on voucher_type for efficient filtering
CREATE INDEX IF NOT EXISTS idx_booking_vouchers_voucher_type
  ON public.booking_vouchers(voucher_type);
