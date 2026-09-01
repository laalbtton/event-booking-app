import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

/**
 * POST /api/push/register-fcm
 *
 * Registers (or refreshes) an FCM token for a native Android/iOS client.
 * Called by the Capacitor app after receiving a registration token from FCM.
 *
 * Body: { fcmToken: string, platform: 'android' | 'ios' }
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const fcmToken = body?.fcmToken as string | undefined
    const platform = body?.platform as string | undefined

    if (!fcmToken) {
      return NextResponse.json({ error: 'fcmToken is required' }, { status: 400 })
    }
    if (platform !== 'android' && platform !== 'ios') {
      return NextResponse.json({ error: "platform must be 'android' or 'ios'" }, { status: 400 })
    }

    // Capacitor's iOS plugin returns a hex APNs token unless AppDelegate
    // exchanges it for an FCM token via Firebase Messaging. APNs hex cannot
    // be sent with firebase-admin and would look "registered" but never notify.
    const looksLikeApnsHex = /^[0-9a-f]+$/i.test(fcmToken) && !fcmToken.includes(':')
    if (platform === 'ios' && looksLikeApnsHex) {
      return NextResponse.json(
        {
          error:
            'iPhone sent an Apple push token instead of an FCM token. Add GoogleService-Info.plist (Firebase iOS app com.laalbutton.app), rebuild, and try again.',
        },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    // Use the full token as the endpoint so the unique-endpoint constraint is
    // never violated between two different FCM registrations.
    const endpoint = `fcm:${fcmToken}`

    // Select-then-update/insert avoids relying on the PostgREST upsert's
    // ability to target a UNIQUE CONSTRAINT by name (partial indexes are not
    // supported as conflict targets in older PostgREST versions).
    const { data: existing } = await supabase
      .from('push_subscriptions')
      .select('id')
      .eq('fcm_token', fcmToken)
      .maybeSingle()

    let dbError
    if (existing?.id) {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({
          user_id: user.id,
          platform,
          endpoint,
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        })
        .eq('id', existing.id)
      dbError = error
    } else {
      const { error } = await supabase
        .from('push_subscriptions')
        .insert({
          user_id: user.id,
          platform,
          fcm_token: fcmToken,
          endpoint,
          p256dh: null,
          auth: null,
          user_agent: request.headers.get('user-agent'),
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        })
      dbError = error
    }

    if (dbError) {
      console.error('register-fcm db error:', dbError)
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Ensure a push_notification_prefs row exists for this user.
    await supabase
      .from('push_notification_prefs')
      .upsert(
        {
          user_id: user.id,
          subscribed_at: now,
          native_permission_denied_at: null,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('register-fcm error:', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
