import webpush, { type PushSubscription } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendFcmToSubscription } from './fcmPush'

type PushPayload = {
  title: string
  body: string
  data?: {
    url?: string
    route?: string
    [key: string]: unknown
  }
}

type PushCategory =
  | 'booking_updates'
  | 'event_reminders'
  | 'new_events'
  | 'post_event_reviews'
  | 'jokes'
  | 'follows'

export type SendPushOptions = {
  /** When true, sends to all active subscriptions regardless of user category toggles (for super-admin broadcasts). */
  bypassCategoryPrefs?: boolean
}

let vapidConfigured = false

function ensureWebPushConfigured() {
  if (vapidConfigured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    const missing = [
      !publicKey && 'NEXT_PUBLIC_VAPID_PUBLIC_KEY',
      !privateKey && 'VAPID_PRIVATE_KEY',
      !subject && 'VAPID_SUBJECT',
    ].filter(Boolean) as string[]
    throw new Error(`Missing VAPID env vars: ${missing.join(', ')}. Add them to .env.local and restart the dev server.`)
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
}

function getWebPushSubscription(row: { endpoint: string; p256dh: string; auth: string }): PushSubscription {
  return {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  }
}

/**
 * Build the FCM data payload from the push payload. All values must be strings.
 *
 * CapacitorProvider reads `data.route` to navigate after a notification tap.
 * When the caller only supplies `url` (the common case) we mirror it into
 * `route` so taps always deep-link correctly instead of falling back to /dashboard.
 */
function buildFcmData(payload: PushPayload): Record<string, string> {
  const data: Record<string, string> = {}
  if (payload.data?.url) data.url = payload.data.url
  if (payload.data?.route) {
    data.route = payload.data.route
  } else if (payload.data?.url) {
    // Mirror url → route so CapacitorProvider can navigate on tap.
    data.route = payload.data.url
  }
  return data
}

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
  category: PushCategory = 'booking_updates',
  options?: SendPushOptions
) {
  const bypass = options?.bypassCategoryPrefs === true

  if (!bypass) {
    const { data: prefs } = await supabase
      .from('push_notification_prefs')
      .select(
        'booking_updates_enabled, event_reminders_enabled, new_events_enabled, post_event_reviews_enabled, jokes_notifications_enabled, follow_updates_enabled',
      )
      .eq('user_id', userId)
      .maybeSingle()

    const categoryEnabledMap: Record<PushCategory, boolean> = {
      booking_updates: prefs?.booking_updates_enabled !== false,
      event_reminders: prefs?.event_reminders_enabled !== false,
      new_events: prefs?.new_events_enabled !== false,
      post_event_reviews: prefs?.post_event_reviews_enabled !== false,
      jokes: prefs?.jokes_notifications_enabled !== false,
      follows: prefs?.follow_updates_enabled !== false,
    }

    if (!categoryEnabledMap[category]) {
      return { sent: 0, failed: 0, skipped: true }
    }
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, platform, fcm_token')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0
  const sendErrors: Array<{
    subscriptionId: string
    platform: string
    errorCode?: string
    errorMessage: string
  }> = []

  for (const row of subscriptions) {
    const platform = row.platform ?? 'web'

    if (platform === 'android' || platform === 'ios') {
      if (!row.fcm_token) {
        failed += 1
        sendErrors.push({
          subscriptionId: row.id,
          platform,
          errorMessage: 'Subscription has no FCM token',
        })
        continue
      }
      const result = await sendFcmToSubscription(supabase, row.id, row.fcm_token, {
        title: payload.title,
        body: payload.body,
        data: buildFcmData(payload),
      })
      if (result.sent) {
        sent += 1
      } else {
        failed += 1
        sendErrors.push({
          subscriptionId: row.id,
          platform,
          errorCode: result.errorCode,
          errorMessage: result.errorMessage || 'FCM send failed',
        })
      }
    } else {
      // Web push via VAPID
      try {
        ensureWebPushConfigured()
        await webpush.sendNotification(
          getWebPushSubscription(row as { endpoint: string; p256dh: string; auth: string }),
          JSON.stringify(payload)
        )
        sent += 1
      } catch (err: unknown) {
        failed += 1
        sendErrors.push({
          subscriptionId: row.id,
          platform,
          errorMessage: err instanceof Error ? err.message : String(err),
        })
        const statusCode =
          typeof err === 'object' &&
          err !== null &&
          'statusCode' in err &&
          typeof (err as { statusCode?: unknown }).statusCode === 'number'
            ? (err as { statusCode: number }).statusCode
            : 0
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from('push_subscriptions')
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', row.id)
        }
      }
    }
  }

  return { sent, failed, sendErrors }
}

export async function sendPushToAllUsers(
  supabase: SupabaseClient,
  payload: PushPayload,
  category: PushCategory = 'new_events',
  options?: SendPushOptions
) {
  const pageSize = 500
  let offset = 0
  let totalSent = 0
  let totalFailed = 0
  let totalSkipped = 0

  while (true) {
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id')
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    if (!users || users.length === 0) break

    for (const user of users) {
      const result = await sendPushToUser(supabase, user.id, payload, category, options)
      totalSent += result.sent || 0
      totalFailed += result.failed || 0
      if ('skipped' in result && result.skipped) totalSkipped += 1
    }

    if (users.length < pageSize) break
    offset += pageSize
  }

  return {
    sent: totalSent,
    failed: totalFailed,
    skippedUsers: totalSkipped,
  }
}
