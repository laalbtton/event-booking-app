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

    const now = new Date().toISOString()

    // Upsert on fcm_token so token refreshes just update the user_id / last_seen.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          platform,
          fcm_token: fcmToken,
          // Nullify web-push fields so constraints are not violated.
          endpoint: `fcm:${fcmToken.slice(0, 16)}`,
          p256dh: null,
          auth: null,
          user_agent: request.headers.get('user-agent'),
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: 'fcm_token' }
      )

    if (error) {
      console.error('register-fcm upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
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
