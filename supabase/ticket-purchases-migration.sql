-- Ticket Purchases table
-- Tracks real-money ticket purchases for booked_show events.
-- Guest purchases (no Supabase user) are allowed; user_id may be NULL.
-- Run once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS ticket_purchases (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id              UUID        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  stripe_session_id     TEXT        UNIQUE,
  stripe_payment_intent TEXT,
  user_id               UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  buyer_name            TEXT,
  buyer_email           TEXT,
  quantity              INTEGER     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_cents      INTEGER     NOT NULL CHECK (unit_price_cents >= 0),
  total_cents           INTEGER     NOT NULL CHECK (total_cents >= 0),
  currency              TEXT        NOT NULL DEFAULT 'cad',
  status                TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'refunded', 'cancelled')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ticket_purchases_event_id  ON ticket_purchases (event_id);
CREATE INDEX IF NOT EXISTS ticket_purchases_user_id   ON ticket_purchases (user_id);
CREATE INDEX IF NOT EXISTS ticket_purchases_session   ON ticket_purchases (stripe_session_id);

ALTER TABLE ticket_purchases ENABLE ROW LEVEL SECURITY;

-- Anyone can see their own purchases (matched by user_id or buyer_email via service role)
CREATE POLICY "Users read own ticket purchases"
  ON ticket_purchases FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can read all
CREATE POLICY "Admins read all ticket purchases"
  ON ticket_purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role handles all writes (bypasses RLS)
