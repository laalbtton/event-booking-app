-- Email templates table
-- Allows admins to customise the subject, intro paragraph, and footer
-- of automated community emails without touching code.
--
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS email_templates (
  key          TEXT PRIMARY KEY,
  subject      TEXT NOT NULL,
  intro        TEXT,
  footer       TEXT,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_by   UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Seed default templates (no-op if they already exist)
INSERT INTO email_templates (key, subject, intro, footer) VALUES
  (
    'weekly_digest',
    'What''s on this week 🎤',
    'Here''s a look at what''s coming up across your communities in the next 14 days. We hope to see you at a show!',
    'See you at the show! 🎭'
  ),
  (
    'pre_event_reminder',
    'Your event is in 48 hours 🎤',
    'Just a friendly reminder that you''re registered for an upcoming event. We''re looking forward to seeing you there!',
    'Break a leg! 🎭'
  )
ON CONFLICT (key) DO NOTHING;

-- RLS: only service-role writes (no public access needed)
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin read email_templates"
  ON email_templates FOR SELECT
  USING (true);  -- public read is fine (no sensitive data here)

CREATE POLICY "Admin write email_templates"
  ON email_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
