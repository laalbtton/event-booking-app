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
  apnsReason?: string
  httpStatus?: number
  rawError?: string
  hint?: string
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

function hintForApnsFailure(apnsReason?: string, message?: string): string | undefined {
  const blob = `${apnsReason ?? ''} ${message ?? ''}`.toLowerCase()
  if (blob.includes('badenvironmentkeyintoken') || blob.includes('badenvironment')) {
    return 'Apple rejected the key for this environment. A Sandbox key cannot send to TestFlight (Production), and a Production key cannot send to Xcode debug builds. Use a matching key in each Firebase slot.'
  }
  if (blob.includes('invalidprovidertoken') || blob.includes('invalid apns')) {
    return 'Apple rejected the JWT Firebase built from your .p8. Recheck Production Key ID, Team ID (Membership page, not the Key ID), and that the uploaded file is AuthKey_<thatKeyId>.p8 for an APNs key — not an App Store Connect API key.'
  }
  if (blob.includes('topicdisallowed') || blob.includes('badtopic')) {
    return 'This APNs key is topic-restricted and does not include com.laalbutton.app. Use a Team Scoped (All Topics) key, or add this bundle ID to the topic list.'
  }
  if (blob.includes('missingprovidertoken') || blob.includes('missing')) {
    return 'Firebase has no usable APNs auth material for this send. Confirm both Development and Production keys are still present after save.'
  }
  return undefined
}

type FcmV1ErrorBody = {
  error?: {
    code?: number
    message?: string
    status?: string
    details?: Array<Record<string, unknown>>
  }
}

function parseFcmV1Error(httpStatus: number, body: FcmV1ErrorBody): {
  code: string
  message: string
  apnsReason?: string
  hint?: string
  rawError: string
} {
  const details = body.error?.details ?? []
  let fcmCode = ''
  let apnsReason: string | undefined
  let apnsStatus: number | undefined
  for (const item of details) {
    const type = String(item['@type'] ?? '')
    if (type.includes('FcmError') && typeof item.errorCode === 'string') {
      fcmCode = item.errorCode
    }
    if (type.includes('ApnsError')) {
      if (typeof item.reason === 'string') apnsReason = item.reason
      if (typeof item.statusCode === 'number') apnsStatus = item.statusCode
    }
  }
  const message = body.error?.message || `FCM HTTP ${httpStatus}`
  const code = fcmCode
    ? `messaging/${fcmCode.toLowerCase().replace(/_/g, '-')}`
    : body.error?.status || `http-${httpStatus}`
  const rawError = JSON.stringify(
    {
      httpStatus,
      status: body.error?.status,
      message,
      fcmErrorCode: fcmCode || undefined,
      apnsStatusCode: apnsStatus,
      apnsReason,
      details,
    },
    null,
    2,
  )
  return {
    code,
    message: [
      message,
      apnsReason ? `APNs reason: ${apnsReason}` : null,
      apnsStatus ? `APNs HTTP ${apnsStatus}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    apnsReason,
    hint: hintForApnsFailure(apnsReason, message),
    rawError,
  }
}

function buildFcmMessage(fcmToken: string, payload: FcmPayload) {
  return {
    token: fcmToken,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: payload.data ?? {},
    android: {
      priority: 'HIGH',
      notification: {
        sound: 'default',
        channelId: 'default',
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
  }
}

async function getFcmAccessToken(): Promise<{ token: string; projectId: string }> {
  const app = getAdminApp()
  const projectId = process.env.FIREBASE_PROJECT_ID
  if (!projectId) throw new Error('FIREBASE_PROJECT_ID is not set')
  const credential = app.options.credential as
    | { getAccessToken?: () => Promise<{ access_token: string }> }
    | undefined
  if (!credential?.getAccessToken) {
    throw new Error('Firebase credential cannot mint an access token')
  }
  const { access_token } = await credential.getAccessToken()
  if (!access_token) throw new Error('Firebase access token was empty')
  return { token: access_token, projectId }
}

/**
 * Send a push notification to one FCM token.
 *
 * Uses the FCM HTTP v1 API so Apple's APNs error details are preserved
 * (firebase-admin otherwise collapses them to "invalid APNs credentials").
 */
export async function sendFcmNotification(
  fcmToken: string,
  payload: FcmPayload
): Promise<FcmSendResult> {
  try {
    const { token, projectId } = await getFcmAccessToken()
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: buildFcmMessage(fcmToken, payload) }),
      },
    )
    const text = await res.text()
    let parsed: FcmV1ErrorBody & { name?: string } = {}
    try {
      parsed = text ? (JSON.parse(text) as FcmV1ErrorBody) : {}
    } catch {
      parsed = { error: { message: text.slice(0, 500) } }
    }

    if (res.ok) return { sent: true }

    const parsedError = parseFcmV1Error(res.status, parsed)
    const fcmCode = String(
      parsed.error?.details?.find((d) => String(d['@type'] ?? '').includes('FcmError'))?.errorCode ?? '',
    )
    const stale = fcmCode === 'UNREGISTERED' || fcmCode === 'SENDER_ID_MISMATCH'

    console.error('FCM send error:', parsedError.code, parsedError.message, parsedError.rawError)

    return {
      sent: false,
      stale,
      errorCode: parsedError.code,
      errorMessage: parsedError.message,
      apnsReason: parsedError.apnsReason,
      httpStatus: res.status,
      rawError: parsedError.rawError,
      hint: parsedError.hint,
    }
  } catch (err: unknown) {
    const { code, message } = fcmErrorParts(err)
    console.error('FCM send error:', code || '(no code)', message)
    return {
      sent: false,
      errorCode: code || undefined,
      errorMessage: message,
      rawError: err instanceof Error ? err.stack : String(err),
      hint: hintForApnsFailure(undefined, message),
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
