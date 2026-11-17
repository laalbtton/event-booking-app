-- Add/update editable Facebook lead welcome email template.
-- Safe to re-run.

INSERT INTO email_templates (key, subject, intro, footer) VALUES
  (
    'facebook_lead_welcome',
    'Welcome to Laal Button from Sunny',
    E'Thanks for your interest in live comedy in Brampton. Our free event is happening this Wednesday in Downtown Brampton at 8:00 PM. There is lots of free parking in the area such as the Nelson Parking lot. Our paid shows happen on weekends — keep an eye out for those. Hope to see you there. Use this link for more details: https://app.laalbutton.com/brampton\n\nWe also have a WhatsApp group for ticket updates — join here: https://chat.whatsapp.com/JGvL1FAqa8n9tl6tsuceTO?s=cl&p=a&iam=2',
    E'Sunny\n647-490-7858\n\nYou''re receiving this because you asked to hear from Laal Button through our Facebook form. Reply with "unsubscribe" if you no longer want these emails.'
  )
ON CONFLICT (key) DO UPDATE SET
  subject = EXCLUDED.subject,
  intro = EXCLUDED.intro,
  footer = EXCLUDED.footer,
  updated_at = NOW();
