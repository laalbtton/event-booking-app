import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/server/push'
import { eventPosterSharePath } from '@/lib/posterShare'

/** Existing constraint type — works without a new migration. */
export const SHARE_POSTER_NOTIFY_TYPE = 'host_poster_reminder_24h'

type Role = 'host' | 'signup'

export function sharePosterDeepLink(eventIdOrSlug: string): string {
  return eventPosterSharePath(eventIdOrSlug)
}

export async function notifyUserToSharePoster(
  supabase: SupabaseClient,
  args: {
    userId: string
    eventId: string
    eventSlug?: string | null
    eventTitle: string
    role: Role
    bookingId?: string | null
  }
): Promise<boolean> {
  const { userId, eventId, eventSlug, eventTitle, role, bookingId } = args

  const { data: existing } = await supabase
    .from('notifications')
    .select('id')
    .eq('user_id', userId)
    .eq('related_event_id', eventId)
    .eq('type', SHARE_POSTER_NOTIFY_TYPE)
    .limit(1)
    .maybeSingle()

  if (existing) return false

  const title = role === 'host' ? 'Share your event poster' : 'Share this event poster'
  const message =
    role === 'host'
      ? `"${eventTitle}" is coming up. Tap to open the poster and share it in one tap.`
      : `You are signed up for "${eventTitle}". Tap to open the poster and share it with friends.`

  const { error: insErr } = await supabase.from('notifications').insert({
    user_id: userId,
    type: SHARE_POSTER_NOTIFY_TYPE,
    title,
    message,
    related_event_id: eventId,
    related_booking_id: bookingId || null,
  })

  if (insErr) {
    console.error('share poster notify insert:', insErr)
    return false
  }

  const path = sharePosterDeepLink(eventSlug || eventId)
  try {
    await sendPushToUser(
      supabase,
      userId,
      {
        title,
        body: message,
        data: { url: path, route: path },
      },
      'event_reminders'
    )
  } catch (pushErr) {
    console.error('share poster push:', pushErr)
  }

  return true
}

export function hoursUntilEvent(eventDateIso: string, now = new Date()): number {
  return (new Date(eventDateIso).getTime() - now.getTime()) / (1000 * 60 * 60)
}

/** Signups during the last-day window (event is within 24 hours). */
export function isWithinSharePosterSignupWindow(eventDateIso: string, now = new Date()): boolean {
  const hours = hoursUntilEvent(eventDateIso, now)
  return hours > 0 && hours <= 24
}
