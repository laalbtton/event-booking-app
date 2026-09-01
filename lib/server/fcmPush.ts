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
): Promise<{ sent: boolean; stale?: boolean }> {
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
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
    })
    return { sent: true }
  } catch (err: unknown) {
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? (err as { code: string }).code
        : ''

    // These FCM error codes mean the token is no longer valid.
    const staleTokenCodes = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument',
    ]

    if (staleTokenCodes.some((c) => code.includes(c))) {
      return { sent: false, stale: true }
    }

    console.error('FCM send error:', err)
    return { sent: false }
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
): Promise<{ sent: boolean }> {
  const result = await sendFcmNotification(fcmToken, payload)

  if (result.stale) {
    await supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', subscriptionId)
  }

  return { sent: result.sent }
}
