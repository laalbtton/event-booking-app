/**
 * Utilities for reading and writing email templates stored in the
 * `email_templates` table.  The admin editor page uses these to let the
 * super-admin customise subject lines, intro text, and footer notes for
 * every automated community email without touching code.
 */

import { createClient } from '@supabase/supabase-js'

// ── Public constants ────────────────────────────────────────────────────────

export const TEMPLATE_KEYS = {
  WEEKLY_DIGEST: 'weekly_digest',
  PRE_EVENT_REMINDER: 'pre_event_reminder',
  FACEBOOK_LEAD_WELCOME: 'facebook_lead_welcome',
} as const

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS]

export type EmailTemplateRow = {
  key: string
  subject: string
  intro: string | null
  footer: string | null
  updated_at: string
  updated_by: string | null
}

// ── Hard-coded defaults (used when DB row is missing / on first run) ────────

const DEFAULTS: Record<string, { subject: string; intro: string; footer: string }> = {
  weekly_digest: {
    subject: "What's on this week 🎤",
    intro:
      "Here's a look at what's coming up across your communities in the next 14 days. We hope to see you at a show!",
    footer: 'See you at the show! 🎭',
  },
  pre_event_reminder: {
    subject: "Your event is in 48 hours 🎤",
    intro:
      "Just a friendly reminder that you're registered for an upcoming event. We're looking forward to seeing you there!",
    footer: 'Break a leg! 🎭',
  },
  facebook_lead_welcome: {
    subject: 'Welcome to Laal Button from Sunny',
    intro:
      "Thanks for your interest in live comedy in Brampton. Our free event is happening this Wednesday in Downtown Brampton at 8:00 PM. There is lots of free parking in the area such as the Nelson Parking lot. Our paid shows happen on weekends — keep an eye out for those. Hope to see you there. Use this link for more details: https://app.laalbutton.com/brampton\n\nWe also have a WhatsApp group for ticket updates — join here: https://chat.whatsapp.com/JGvL1FAqa8n9tl6tsuceTO?s=cl&p=a&iam=2",
    footer:
      "Sunny\n647-490-7858\n\nYou're receiving this because you asked to hear from Laal Button through our Facebook form. Reply with \"unsubscribe\" if you no longer want these emails.",
  },
}

// ── Internal Supabase client (service role) ─────────────────────────────────

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

// ── Public helpers ──────────────────────────────────────────────────────────

/** Fetch a resolved template, falling back to hard-coded defaults. */
export async function getEmailTemplate(
  key: string,
): Promise<{ subject: string; intro: string; footer: string }> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('email_templates')
    .select('subject, intro, footer')
    .eq('key', key)
    .maybeSingle()

  const d = DEFAULTS[key] ?? { subject: '', intro: '', footer: '' }
  if (!data) return d

  return {
    subject: (data as { subject: string }).subject || d.subject,
    intro: (data as { intro: string | null }).intro || d.intro,
    footer: (data as { footer: string | null }).footer || d.footer,
  }
}

/** Fetch all templates for the admin editor. */
export async function getAllEmailTemplates(): Promise<EmailTemplateRow[]> {
  const supabase = getAdminClient()
  const { data } = await supabase
    .from('email_templates')
    .select('key, subject, intro, footer, updated_at, updated_by')
    .order('key')

  return (data as EmailTemplateRow[]) ?? []
}

/** Upsert template fields. */
export async function updateEmailTemplate(
  key: string,
  updates: { subject?: string; intro?: string; footer?: string },
  updatedBy?: string,
): Promise<void> {
  const supabase = getAdminClient()
  await supabase.from('email_templates').upsert(
    {
      key,
      ...updates,
      updated_at: new Date().toISOString(),
      ...(updatedBy ? { updated_by: updatedBy } : {}),
    },
    { onConflict: 'key' },
  )
}

/**
 * Simple `{{var}}` interpolation.
 * e.g. interpolate("Hi {{user_name}}!", { user_name: "Alice" }) → "Hi Alice!"
 */
export function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`)
}
