import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId } = await params
    const userId = authData.user.id
    const body = await request.json().catch(() => ({}))

    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) is required' }, { status: 400 })
    }

    const { error: upsertError } = await supabase
      .from('event_chat_notification_prefs')
      .upsert(
        { user_id: userId, event_id: eventId, enabled: body.enabled },
        { onConflict: 'user_id,event_id' }
      )

    if (upsertError) throw upsertError

    return NextResponse.json({ success: true, enabled: body.enabled })
  } catch (err) {
    console.error('PUT /chat/notification-pref error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
