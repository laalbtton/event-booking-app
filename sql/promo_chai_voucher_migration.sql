-- ============================================================
-- $1 Chai Promotion (Ryan's Chai) — purchasable promo vouchers
-- Run once in the Supabase SQL editor.
-- ============================================================

-- Allow standalone promo vouchers with no linked event
ALTER TABLE public.booking_vouchers
  ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE public.voucher_redemptions
  ALTER COLUMN event_id DROP NOT NULL;

COMMENT ON COLUMN public.booking_vouchers.voucher_type IS
  'food_coupon = issued at booking; lucky_draw = Red Button prize; promo_chai = purchasable $1 Chai at Ryan''s Chai';

-- Track when the user last viewed the Coupons tab (for unread red dots)
CREATE TABLE IF NOT EXISTS public.user_coupon_tab_state (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_viewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_coupon_tab_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_coupon_tab_state_own" ON public.user_coupon_tab_state;
CREATE POLICY "user_coupon_tab_state_own"
  ON public.user_coupon_tab_state
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
