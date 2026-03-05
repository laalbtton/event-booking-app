ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS no_show_penalty_enabled BOOLEAN;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS no_show_penalty_credits INTEGER;

ALTER TABLE public.events
ADD CONSTRAINT events_no_show_penalty_credits_non_negative
CHECK (no_show_penalty_credits IS NULL OR no_show_penalty_credits >= 0);

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS no_show_penalty_charged_at TIMESTAMPTZ;

ALTER TABLE public.bookings
ADD COLUMN IF NOT EXISTS no_show_penalty_credits INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_no_show_penalty_credits_non_negative
CHECK (no_show_penalty_credits >= 0);

CREATE INDEX IF NOT EXISTS idx_bookings_no_show_penalty_charged_at
ON public.bookings(no_show_penalty_charged_at);
