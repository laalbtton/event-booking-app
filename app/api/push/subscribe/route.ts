import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { subscription } = await request.json()
    const endpoint = subscription?.endpoint as string | undefined
    const p256dh = subscription?.keys?.p256dh as string | undefined
    const auth = subscription?.keys?.auth as string | undefined
    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 })
    }

    const now = new Date().toISOString()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          platform: 'web',
          endpoint,
          p256dh,
          auth,
          user_agent: request.headers.get('user-agent'),
          is_active: true,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: 'endpoint' }
      )

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

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
  } catch (error: any) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

