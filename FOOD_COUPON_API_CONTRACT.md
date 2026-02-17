# Food Coupon API Contract (Phase 1)

This document defines an implementation-ready contract for adding venue food coupons to event bookings.

## Goal

Support booking economics like:

- Total booking cost: `10 credits`
- Spot fee component: `5 credits`
- Venue coupon component: `$5` (`500` cents) voucher issued to attendee

## Data model assumptions

From `food_coupons_migration.sql`:

- Event config on `events`:
  - `food_coupon_enabled`
  - `spot_fee_credits`
  - `food_coupon_value_cents`
  - `food_coupon_expires_hours`
- Issued vouchers in `booking_vouchers`
- Redemption audit in `voucher_redemptions`

## API endpoints

### 1) POST `/api/bookings/create`

Creates a booking and (when configured) issues a coupon voucher.

#### Request body

```json
{
  "eventId": "uuid"
}
```

#### Behavior

1. Validate event eligibility and booking rules.
2. Compute `totalCreditsRequired`:
   - If `food_coupon_enabled`:
     - `total = spot_fee_credits + coupon_credits_component`
     - `coupon_credits_component` can be derived from product rule (usually equal to coupon CAD amount in cents / 100).
   - Else:
     - `total = credits_required`
3. Deduct credits from profile.
4. Insert booking.
5. Insert `credit_transactions` rows:
   - `booking_fee`
   - `food_coupon_issued` (if applicable)
6. If applicable, insert `booking_vouchers` with:
   - `status = issued`
   - unique `code`
   - `value_cents = food_coupon_value_cents`
   - `expires_at`
7. Return booking + voucher summary.

#### Response (success)

```json
{
  "bookingId": "uuid",
  "creditsDebited": 10,
  "voucher": {
    "id": "uuid",
    "code": "LB-AB12CD34",
    "valueCents": 500,
    "status": "issued",
    "expiresAt": "2026-02-20T18:30:00.000Z"
  }
}
```

---

### 2) POST `/api/bookings/cancel`

Cancels booking and applies refund logic based on window + voucher status.

#### Request body

```json
{
  "bookingId": "uuid"
}
```

#### Behavior

1. Validate ownership/authorization.
2. Check cancellation policy window.
3. If voucher exists and status is `issued`:
   - mark voucher `cancelled`
   - refund coupon component when policy allows.
4. If voucher status is `redeemed`:
   - do not refund coupon component.
5. Refund fee component based on policy.
6. Log refund transactions in `credit_transactions`.

#### Response

```json
{
  "bookingId": "uuid",
  "refundedCredits": 5,
  "voucherRefunded": false
}
```

---

### 3) GET `/api/vouchers/my`

Returns current user vouchers (issued/redeemed/expired/cancelled).

#### Response

```json
{
  "vouchers": [
    {
      "id": "uuid",
      "eventId": "uuid",
      "eventTitle": "Open Mic Night",
      "code": "LB-AB12CD34",
      "valueCents": 500,
      "status": "issued",
      "expiresAt": "2026-02-20T18:30:00.000Z"
    }
  ]
}
```

---

### 4) POST `/api/vouchers/redeem`

Venue/event manager redemption endpoint.

#### Request body

```json
{
  "code": "LB-AB12CD34",
  "orderTotalCents": 2400
}
```

#### Behavior

1. Resolve voucher by code.
2. Validate:
   - `status = issued`
   - not expired
   - event permissions (creator/host/admin for Phase 1)
3. Update voucher:
   - `status = redeemed`
   - `redeemed_at = now()`
   - `redeemed_by = auth.uid()`
4. Insert `voucher_redemptions` audit row.

#### Response

```json
{
  "voucherId": "uuid",
  "discountCents": 500,
  "status": "redeemed"
}
```

## UI contract

- Event creation/edit:
  - toggle `food_coupon_enabled`
  - inputs for `spot_fee_credits`, `food_coupon_value_cents`
- Booking confirmation:
  - show split breakdown before user confirms.
- User booking/event details:
  - show voucher status + code.
- Manage attendance (host/admin):
  - add a "Redeem coupon" action (manual code first; QR later).

## Transaction types to introduce

For better audit clarity in `credit_transactions`:

- `booking_fee`
- `food_coupon_issued`
- `food_coupon_refund`
- `food_coupon_adjustment` (optional admin action)

## Rollout plan

### Phase 1 (recommended now)

- Schema + RLS (`food_coupons_migration.sql`)
- API endpoints above
- Manual code redemption (no scanner)

### Phase 2

- QR scanner flow
- Venue staff role separation from event host/admin
- Settlement reporting per venue

