-- SMS consent ledger shared by Twilio/Pabbly and app-originated messages.
-- Run after facebook_lead_deliveries_migration.sql.

CREATE TABLE IF NOT EXISTS public.sms_suppressions (
  phone TEXT PRIMARY KEY,
  opted_out BOOLEAN NOT NULL DEFAULT TRUE,
  source TEXT NOT NULL DEFAULT 'twilio_inbound',
  last_keyword TEXT,
  opted_out_at TIMESTAMPTZ,
  opted_in_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.sms_suppressions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.sms_suppressions IS
  'Normalized phone-level SMS STOP/START state; service-role access only';

ALTER TABLE public.facebook_lead_deliveries
  DROP CONSTRAINT IF EXISTS facebook_lead_deliveries_sms_status_check;

ALTER TABLE public.facebook_lead_deliveries
  ADD CONSTRAINT facebook_lead_deliveries_sms_status_check
  CHECK (
    sms_status IN (
      'pending',
      'sent',
      'failed',
      'skipped_missing',
      'skipped_no_consent',
      'skipped_opted_out'
    )
  );
