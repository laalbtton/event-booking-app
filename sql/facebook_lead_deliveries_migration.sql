-- Delivery ledger for Facebook Lead Ads received through Meta or Google Sheets.
-- This is intentionally service-role only: it contains external lead IDs and
-- messaging outcomes, and does not need direct browser access.

CREATE TABLE IF NOT EXISTS public.facebook_lead_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'facebook',
  external_id TEXT NOT NULL,
  crm_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  email_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped_missing', 'skipped_no_consent')),
  email_sent_at TIMESTAMPTZ,
  email_error TEXT,
  sms_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (sms_status IN ('pending', 'sent', 'failed', 'skipped_missing', 'skipped_no_consent')),
  sms_sent_at TIMESTAMPTZ,
  sms_error TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, external_id)
);

-- Safe when upgrading from the original Sheet-only version.
ALTER TABLE public.facebook_lead_deliveries
  ALTER COLUMN source SET DEFAULT 'facebook';

CREATE INDEX IF NOT EXISTS facebook_lead_deliveries_contact_idx
  ON public.facebook_lead_deliveries (crm_contact_id);

CREATE OR REPLACE FUNCTION public.facebook_lead_deliveries_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS facebook_lead_deliveries_touch ON public.facebook_lead_deliveries;
CREATE TRIGGER facebook_lead_deliveries_touch
  BEFORE UPDATE ON public.facebook_lead_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.facebook_lead_deliveries_touch_updated_at();

ALTER TABLE public.facebook_lead_deliveries ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.facebook_lead_deliveries IS
  'Idempotency and delivery status for Facebook leads received from Meta or Google Sheets';
