-- Add cancellation_date to bookings for cancellation auditing
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS cancellation_date TIMESTAMPTZ;

