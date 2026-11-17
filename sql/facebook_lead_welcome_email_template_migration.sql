-- Add editable Facebook lead welcome email template.
-- Safe to re-run.

INSERT INTO email_templates (key, subject, intro, footer) VALUES
  (
    'facebook_lead_welcome',
    'Welcome to One Mic Stand 🎤',
    'Thanks for your interest in live comedy. We''ll keep you posted about upcoming shows, open mics, and special events.',
    'You''re receiving this because you asked to hear from One Mic Stand through our Facebook form. Reply with "unsubscribe" if you no longer want these emails.'
  )
ON CONFLICT (key) DO NOTHING;
