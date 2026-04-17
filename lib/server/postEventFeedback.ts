/**
 * Shared logic for sending post-event feedback emails.
 * Used by both:
 *   – the Inngest function  (inngest/functions/postEventFeedback.ts)
 *   – the manual trigger API (app/api/send-post-event-feedback/route.ts)
 */

import { createClient } from '@supabase/supabase-js'
import { getPostEventFeedbackEmail, sendEmail } from '@/lib/email'
import { formatDateTime } from '@/lib/dateUtils'

export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdoMsGHkla6nxE7ZRLKg71QtCGxaY70xRP00X6C6VrVPZ0xFg/viewform?usp=dialog'

const NOTIFICATION_TYPE = 'post_event_feedback'

export function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://laalbutton.com'
}

export type SendResult = {
  emailsSent: number
  skipped: number
  errors: Array<{ userId: string; error: string }>
}

export async function sendFeedbackEmailsForEvent(eventId: string): Promise<SendResult> {
  const supabase = getAdminSupabase()
  const siteUrl = getSiteUrl()

  // Load the event + venue
  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select(`
      id,
      title,
      date,
      end_time,
      slug,
      status,
      venue_id,
      venues:venue_id (
        name,
        google_review_url
      )
    `)
    .eq('id', eventId)
    .single()

  if (eventErr || !eventRow) throw new Error(`Event not found: ${eventId}`)

  const ev = eventRow as {
    id: string
    title: string
    date: string
    end_time: string | null
    slug: string | null
    status: string | null
    venue_id: string | null
    venues: { name: string; google_review_url: string | null } | null
  }

  // Don't send for cancelled/archived events
  if (['cancelled', 'archived'].includes((ev.status ?? '').toLowerCase())) {
    return { emailsSent: 0, skipped: 0, errors: [] }
  }

  const venueName = ev.venues?.name ?? 'the venue'
  const venueGoogleReviewUrl = ev.venues?.google_review_url ?? null
  const eventUrl = `${siteUrl}/events/${ev.slug ?? ev.id}`

  // All confirmed bookings (performers + audience)
  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select(`
      id,
      user_id,
      profiles:user_id (
        id,
        full_name,
        email
      )
    `)
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (bookingsErr) throw new Error(`Failed to load bookings: ${bookingsErr.message}`)

  const result: SendResult = { emailsSent: 0, skipped: 0, errors: [] }

  for (const booking of (bookings ?? []) as Array<{
    id: string
    user_id: string
    profiles: { id: string; full_name: string | null; email: string } | null
  }>) {
    const profile = booking.profiles
    if (!profile?.email) { result.skipped++; continue }

    // Deduplication: skip if already sent
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', booking.user_id)
      .eq('type', NOTIFICATION_TYPE)
      .eq('related_event_id', eventId)
      .maybeSingle()

    if (existing) { result.skipped++; continue }

    const html = getPostEventFeedbackEmail({
      userName: profile.full_name || 'there',
      eventTitle: ev.title,
      eventDate: formatDateTime(ev.date),
      venueName,
      venueGoogleReviewUrl,
      feedbackFormUrl: FEEDBACK_FORM_URL,
      eventUrl,
    })

    const sent = await sendEmail({
      to: profile.email,
      subject: `Thanks for joining "${ev.title}" — we'd love your thoughts 🎤`,
      html,
    })

    if (sent) {
      await supabase.from('notifications').insert({
        user_id: booking.user_id,
        type: NOTIFICATION_TYPE,
        title: 'Post-event feedback',
        message: `Thanks for joining "${ev.title}". Share your feedback!`,
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
