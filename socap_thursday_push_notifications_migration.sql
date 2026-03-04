ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS thursday_socap_open_push_sent_at TIMESTAMPTZ;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS thursday_socap_75_push_sent_at TIMESTAMPTZ;
