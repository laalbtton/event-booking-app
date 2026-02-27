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

let configured = false

function ensureWebPushConfigured() {
  if (configured) return

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT

  if (!publicKey || !privateKey || !subject) {
    throw new Error('Missing VAPID env vars')
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  configured = true
}

function getSubscriptionFromRow(row: any): PushSubscription {
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
  payload: PushPayload
) {
  ensureWebPushConfigured()

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
    } catch (error: any) {
      failed += 1
      const statusCode = Number(error?.statusCode || 0)
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

