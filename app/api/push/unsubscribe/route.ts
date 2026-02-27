import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { endpoint } = await request.json().catch(() => ({ endpoint: null }))
    const now = new Date().toISOString()

    let query = supabase
      .from('push_subscriptions')
      .update({ is_active: false, updated_at: now })
      .eq('user_id', user.id)

    if (endpoint) {
      query = query.eq('endpoint', endpoint)
    }

    const { error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    await supabase
      .from('push_notification_prefs')
      .upsert(
        {
          user_id: user.id,
          subscribed_at: null,
          updated_at: now,
        },
        { onConflict: 'user_id' }
      )

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Push unsubscribe error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

