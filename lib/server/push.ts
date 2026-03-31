import webpush, { type PushSubscription } from 'web-push'
import type { SupabaseClient } from '@supabase/supabase-js'

type PushPayload = {
  title: string
  body: string
  data?: {
    url?: string
    [key: string]: unknown
  }
}

type PushCategory = 'booking_updates' | 'event_reminders' | 'new_events'

export type SendPushOptions = {
  /** When true, sends to all active subscriptions regardless of user category toggles (for super-admin broadcasts). */
  bypassCategoryPrefs?: boolean
}

let configured = false

function ensureWebPushConfigured() {
  if (configured) return

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
  configured = true
}

function getSubscriptionFromRow(row: { endpoint: string; p256dh: string; auth: string }): PushSubscription {
  return {
    endpoint: row.endpoint,
    expirationTime: null,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  }
}

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: PushPayload,
  category: PushCategory = 'booking_updates',
  options?: SendPushOptions
) {
  ensureWebPushConfigured()

  const bypass = options?.bypassCategoryPrefs === true

  if (!bypass) {
    const { data: prefs } = await supabase
      .from('push_notification_prefs')
      .select('booking_updates_enabled, event_reminders_enabled, new_events_enabled')
      .eq('user_id', userId)
      .maybeSingle()

    const categoryEnabledMap: Record<PushCategory, boolean> = {
      booking_updates: prefs?.booking_updates_enabled !== false,
      event_reminders: prefs?.event_reminders_enabled !== false,
      new_events: prefs?.new_events_enabled !== false,
    }

    if (!categoryEnabledMap[category]) {
      return { sent: 0, failed: 0, skipped: true }
    }
  }

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error
  if (!subscriptions || subscriptions.length === 0) {
    return { sent: 0, failed: 0 }
  }

  let sent = 0
  let failed = 0

  for (const row of subscriptions) {
    try {
      await webpush.sendNotification(getSubscriptionFromRow(row), JSON.stringify(payload))
      sent += 1
    } catch (error: unknown) {
      failed += 1
      const statusCode =
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 0
      if (statusCode === 404 || statusCode === 410) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('id', row.id)
      }
    }
  }

  return { sent, failed }
}

export async function sendPushToAllUsers(
  supabase: SupabaseClient,
  payload: PushPayload,
  category: PushCategory = 'new_events',
  options?: SendPushOptions
) {
  ensureWebPushConfigured()

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

