/**
 * Web Push prompts for post-event ratings (separate from feedback emails).
 * Dedupes via notifications row type post_event_review_prompt.
 */

import { getAdminSupabase, getSiteUrl } from '@/lib/server/postEventFeedback'
import { sendPushToUser } from '@/lib/server/push'

const NOTIFICATION_TYPE = 'post_event_review_prompt'

export type PostEventReviewPushResult = {
  sent: number
  skipped: number
  failed: number
  pushErrors: Array<{ userId: string; message: string }>
}

/**
 * Notifies all confirmed bookers to leave ratings for the event / host / lineup.
 * Best-effort: failures on individual sends do not throw.
 */
export async function sendPostEventReviewPushesForEvent(eventId: string): Promise<PostEventReviewPushResult> {
  const supabase = getAdminSupabase()
  const siteBase = getSiteUrl().replace(/\/$/, '')

  const { data: eventRow, error: eventErr } = await supabase
    .from('events')
    .select('id, title, slug, status, date, end_time')
    .eq('id', eventId)
    .maybeSingle()

  if (eventErr || !eventRow) {
    return { sent: 0, skipped: 0, failed: 0, pushErrors: [{ userId: '', message: eventErr?.message || 'Event not found' }] }
  }

  if (['cancelled', 'archived'].includes(String((eventRow as { status?: string }).status || '').toLowerCase())) {
    return { sent: 0, skipped: 0, failed: 0, pushErrors: [] }
  }

  const ev = eventRow as { id: string; title: string; slug: string | null; date: string; end_time: string | null }
  const eventPathSegment = ev.slug && String(ev.slug).length > 0 ? ev.slug : ev.id
  const reviewUrl = `${siteBase}/events/${eventPathSegment}/review`

  const { data: bookings, error: bookingsErr } = await supabase
    .from('bookings')
    .select('id, user_id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  if (bookingsErr) {
    return { sent: 0, skipped: 0, failed: 0, pushErrors: [{ userId: '', message: bookingsErr.message }] }
  }

  const title = 'How was the show?'
  const body = `Rate the host, creator, and lineup for "${ev.title}"`

  const result: PostEventReviewPushResult = { sent: 0, skipped: 0, failed: 0, pushErrors: [] }

  for (const row of (bookings ?? []) as { id: string; user_id: string }[]) {
    const userId = row.user_id
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('type', NOTIFICATION_TYPE)
      .eq('related_event_id', eventId)
      .maybeSingle()

    if (existing) {
      result.skipped += 1
      continue
    }

    try {
      const push = await sendPushToUser(
        supabase,
        userId,
        {
          title,
          body,
          data: { url: reviewUrl },
        },
        'post_event_reviews',
      )
      if (push.skipped) {
        result.skipped += 1
      } else {
        result.sent += push.sent || 0
        result.failed += push.failed || 0
      }

      // Dedupe this campaign so Inngest/job retries do not re-send; covers opt-out and no device.
      await supabase.from('notifications').insert({
        user_id: userId,
        type: NOTIFICATION_TYPE,
        title,
        message: body,
        related_booking_id: row.id,
        related_event_id: eventId,
        read: false,
      })
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      result.pushErrors.push({ userId, message })
    }
  }

  return result
}
