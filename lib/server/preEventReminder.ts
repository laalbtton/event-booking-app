/**
 * Pre-event reminder sender.
 *
 * Sends a reminder email to all confirmed attendees / performers 48 hours
 * before an event's start time.  Called by the Inngest function after
 * sleeping until (eventStart − 48h).
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { getPreEventReminderEmail } from '@/lib/email'
import { getEmailTemplate, interpolate, TEMPLATE_KEYS } from '@/lib/server/emailTemplates'
import { formatDateTimeEastern } from '@/lib/dateUtils'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://laalbutton.com'
}

export type ReminderResult = {
  emailsSent: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
}

const NOTIFICATION_TYPE = 'pre_event_reminder'

export async function sendPreEventReminders(eventId: string): Promise<ReminderResult> {
  const supabase = getAdminSupabase()
  const siteUrl = getSiteUrl()
  const result: ReminderResult = { emailsSent: 0, skipped: 0, errors: [] }

  // ── 1. Load event + venue ─────────────────────────────────────────────────
  const { data: eventRow, error: evErr } = await supabase
    .from('events')
    .select('id, title, date, slug, status, location, venue_id')
    .eq('id', eventId)
    .maybeSingle()

  if (evErr || !eventRow) return result

  const ev = eventRow as {
    id: string
    title: string
    date: string
    slug: string | null
    status: string | null
    location: string | null
    venue_id: string | null
  }

  // Skip cancelled / archived events
  if (['cancelled', 'archived'].includes((ev.status ?? '').toLowerCase())) {
    return result
  }

  let venueName: string | null = null
  let venueAddress: string | null = null

  if (ev.venue_id) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name, address')
      .eq('id', ev.venue_id)
      .maybeSingle()
    if (venue) {
      venueName = (venue as { name: string }).name
      venueAddress = (venue as { address: string }).address
    }
  }

  const eventUrl = `${siteUrl}/events/${ev.slug ?? ev.id}`
  const eventDate = formatDateTimeEastern(ev.date)

  // ── 2. Find the primary community name (for branding in the email) ────────
  let communityName: string | null = null
  const { data: primaryLink } = await supabase
    .from('event_communities')
    .select('community_id, communities(name)')
    .eq('event_id', eventId)
    .eq('is_primary', true)
    .eq('status', 'approved')
    .limit(1)
    .maybeSingle()

  if (primaryLink) {
    const comm = (primaryLink as unknown as { communities: { name: string } | null }).communities
    communityName = comm?.name ?? null
  }

  // ── 3. Fetch all confirmed bookings ───────────────────────────────────────
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, user_id, profiles:user_id(id, full_name, email)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (bErr || !bookings) return result

  // ── 4. Load template ──────────────────────────────────────────────────────
  const tmpl = await getEmailTemplate(TEMPLATE_KEYS.PRE_EVENT_REMINDER)

  // ── 5. Send per booking ───────────────────────────────────────────────────
  for (const booking of (bookings as unknown as Array<{
    id: string
    user_id: string
    profiles: { id: string; full_name: string | null; email: string } | null
  }>)) {
    const profile = booking.profiles
    if (!profile?.email) { result.skipped++; continue }

    // Deduplication
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', booking.user_id)
      .eq('type', NOTIFICATION_TYPE)
      .eq('related_event_id', eventId)
      .maybeSingle()

    if (existing) { result.skipped++; continue }

    const userName = profile.full_name ?? 'there'
    const vars = {
      user_name: userName,
      event_title: ev.title,
      event_date: eventDate,
      venue_name: venueName ?? ev.location ?? 'TBA',
    }

    const html = getPreEventReminderEmail({
      userName,
      eventTitle: ev.title,
      eventDate,
      eventUrl,
      venueName,
      venueAddress,
      communityName,
      intro: interpolate(tmpl.intro, vars),
      footer: interpolate(tmpl.footer, vars),
    })

    const subject = interpolate(tmpl.subject, vars)

    const sent = await sendEmail({ to: profile.email, subject, html })

    if (sent) {
      await supabase.from('notifications').insert({
        user_id: booking.user_id,
        type: NOTIFICATION_TYPE,
        title: 'Event reminder',
        message: `Reminder sent for "${ev.title}"`,
        related_event_id: eventId,
        related_booking_id: booking.id,
      })
      result.emailsSent++
    } else {
      result.errors.push({ userId: booking.user_id, error: 'sendEmail returned false' })
    }
  }

  return result
}
