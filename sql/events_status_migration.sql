-- Add status to events for soft-cancellation
ALTER TABLE events
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Optional: enforce allowed statuses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE events
    ADD CONSTRAINT events_status_check
    CHECK (status IN ('active', 'cancelled'));
  END IF;
END $$;
