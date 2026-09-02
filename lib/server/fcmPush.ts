/**
 * Firebase Cloud Messaging (FCM) server-side sending.
 * Only imported by API routes and server utilities — never by client code.
 *
 * Required environment variables (add to .env.local and Vercel):
 *   FIREBASE_PROJECT_ID      – found in Firebase Console > Project settings > General
 *   FIREBASE_CLIENT_EMAIL    – service account email from the downloaded JSON key
 *   FIREBASE_PRIVATE_KEY     – private key from the JSON (include the BEGIN/END lines;
 *                              in Vercel paste the raw multi-line value)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

type FcmPayload = {
  title: string
  body: string
  data?: Record<string, string>
}

// Lazy singleton — initialised on first send, not at module load time.
let adminApp: import('firebase-admin/app').App | null = null

function getAdminApp() {
  if (adminApp) return adminApp

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    const missing = [
      !projectId && 'FIREBASE_PROJECT_ID',
      !clientEmail && 'FIREBASE_CLIENT_EMAIL',
      !privateKey && 'FIREBASE_PRIVATE_KEY',
    ]
      .filter(Boolean)
      .join(', ')
    throw new Error(`Missing Firebase env vars: ${missing}`)
  }

  // Dynamic require keeps firebase-admin out of any edge/client bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { initializeApp, getApps, cert } = require('firebase-admin/app')

  const existing = getApps()
  if (existing.length > 0) {
    adminApp = existing[0]
    return adminApp!
  }

  // Normalise the private key regardless of how it was pasted into Vercel:
  //   • If stored with literal \n escape sequences → replace with real newlines
  //   • If stored with real newlines already → leave as-is
  // Then strip any stray surrounding quotes that the Vercel UI sometimes adds.
  const normalizedKey = privateKey
    .replace(/^["']|["']$/g, '')          // strip wrapping quotes if any
    .replace(/\\n/g, '\n')                // literal \n → real newline
    .replace(/\r\n/g, '\n')              // CRLF → LF
    .trim()

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: normalizedKey,
    }),
  })

  return adminApp!
}

export type FcmSendResult = {
  sent: boolean
  stale?: boolean
  errorCode?: string
  errorMessage?: string
}

function fcmErrorParts(err: unknown): { code: string; message: string } {
  if (!err || typeof err !== 'object') {
    return { code: '', message: String(err) }
  }
  const record = err as {
    code?: unknown
    message?: unknown
    errorInfo?: { code?: unknown; message?: unknown }
  }
  const code = String(record.errorInfo?.code || record.code || '')
  const message = String(record.errorInfo?.message || record.message || err)
  return { code, message }
}

/**
 * Send a push notification to one FCM token.
 *
 * Returns `{ sent: true }` on success.
 * Returns `{ sent: false, stale: true }` when the token is invalid / expired
 * so the caller can deactivate the subscription in Supabase.
 */
export async function sendFcmNotification(
  fcmToken: string,
  payload: FcmPayload
): Promise<FcmSendResult> {
  const app = getAdminApp()
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getMessaging } = require('firebase-admin/messaging')

  try {
    await getMessaging(app).send({
      token: fcmToken,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      android: {
        priority: 'high',
        notification: {
          // 'default' maps to the system default notification sound.
          sound: 'default',
          // Target the channel created in CapacitorProvider.
          // Capacitor's plugin creates a 'default' channel automatically.
          channelId: 'default',
          // No clickAction — Capacitor handles the intent natively.
          // (The old 'FLUTTER_NOTIFICATION_CLICK' was Flutter-specific and
          // caused silent failures on Capacitor.)
        },
      },
      apns: {
        headers: {
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'apns-topic': 'com.laalbutton.app',
        },
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: 'default',
          },
        },
      },
    })
    return { sent: true }
  } catch (err: unknown) {
    const { code, message } = fcmErrorParts(err)

    // Only deactivate when FCM says this specific device token is dead.
    // Do not treat invalid-argument as stale — that also covers missing APNs
    // credentials and malformed payloads, which would wipe a good iPhone token.
    const staleTokenCodes = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/unregistered',
    ]

    const stale = staleTokenCodes.some((c) => code.includes(c) || message.includes(c))
    console.error('FCM send error:', code || '(no code)', message)

    return {
      sent: false,
      stale,
      errorCode: code || undefined,
      errorMessage: message,
    }
  }
}

/**
 * Convenience wrapper: send to an FCM token and automatically deactivate the
 * push_subscription row in Supabase if the token is stale.
 */
export async function sendFcmToSubscription(
  supabase: SupabaseClient,
  subscriptionId: string,
  fcmToken: string,
  payload: FcmPayload
): Promise<FcmSendResult> {
  const result = await sendFcmNotification(fcmToken, payload)

  if (result.stale) {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
  }

  return result
}
