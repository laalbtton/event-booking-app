import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToUser } from '@/lib/server/push'

/**
 * POST /api/push/test
 *
 * Sends a test push to the calling user on every active subscription.
 * Returns detailed diagnostics so the client can display what happened.
 *
 * Body (all optional):
 *   title   – notification title  (default: "Test notification")
 *   body    – notification body   (default: "Push notifications are working!")
 *   url     – deep-link path      (default: "/dashboard")
 *
 * Response:
 *   {
 *     success: boolean,
 *     sent: number,
 *     failed: number,
 *     subscriptions: Array<{ id, platform, isActive, hasToken }>
 *     firebaseEnvConfigured: boolean,
 *   }
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const title =
      typeof body?.title === 'string' && body.title.trim().length > 0
        ? body.title.trim()
        : 'Test notification'
    const message =
      typeof body?.body === 'string' && body.body.trim().length > 0
        ? body.body.trim()
        : 'Push notifications are working! 🎉'
    const url =
      typeof body?.url === 'string' && body.url.trim().length > 0
        ? body.url.trim()
        : '/dashboard'

    // ── Check Firebase env vars (server-side only, never expose keys) ──
    const firebaseEnvConfigured = Boolean(
      process.env.FIREBASE_PROJECT_ID &&
        process.env.FIREBASE_CLIENT_EMAIL &&
        process.env.FIREBASE_PRIVATE_KEY,
    )

    // ── Inspect active subscriptions for diagnostics ──────────────────
    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('id, platform, is_active, fcm_token, endpoint')
      .eq('user_id', user.id)

    const subsInfo = (subs || []).map((s: {
      id: string
      platform: string | null
      is_active: boolean
      fcm_token: string | null
      endpoint: string | null
    }) => ({
      id: s.id as string,
      platform: (s.platform ?? 'web') as string,
      isActive: Boolean(s.is_active),
      hasToken: Boolean(s.fcm_token),
      hasEndpoint: Boolean(s.endpoint),
    }))

    const activeCount = subsInfo.filter((s) => s.isActive).length

    if (activeCount === 0) {
      return NextResponse.json({
        success: false,
        sent: 0,
        failed: 0,
        subscriptions: subsInfo,
        firebaseEnvConfigured,
        error: 'No active push subscriptions found. Enable notifications in Settings first.',
      })
    }

    // ── Actually send the test push ────────────────────────────────────
    const result = await sendPushToUser(
      supabase,
      user.id,
      { title, body: message, data: { url } },
      'booking_updates',
      { bypassCategoryPrefs: true },  // always deliver test pushes
    )

    return NextResponse.json({
      success: (result.sent ?? 0) > 0,
      sent: result.sent ?? 0,
      failed: result.failed ?? 0,
      subscriptions: subsInfo,
      sendErrors: result.sendErrors ?? [],
      firebaseEnvConfigured,
      firebaseProjectId: process.env.FIREBASE_PROJECT_ID || null,
      expectedIosBundleId: 'com.laalbutton.app',
    })
  } catch (error: unknown) {
    console.error('Push test error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
