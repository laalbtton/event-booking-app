import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
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

    // Any signed-in performer-role user can read chat history.
    // Sending is enforced separately in the send route.
    const [{ data: profile }, { data: event }] = await Promise.all([
      supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle(),
      supabase
        .from('events')
        .select('id, host_user_id, created_by, chat_enabled')
        .eq('id', eventId)
        .maybeSingle(),
    ])

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const isPerformerRole = profile?.role === 'event_creator' || profile?.role === 'admin'
    const isHost = event.host_user_id === userId || event.created_by === userId
    if (!isPerformerRole && !isHost) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    if (!event.chat_enabled) {
      return NextResponse.json({ messages: [] })
    }

    const { data: messages, error: msgError } = await supabase
      .from('event_chat_messages')
      .select('id, content, created_at, user_id, profiles:user_id(display_name, avatar_url)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .limit(100)

    if (msgError) throw msgError

    return NextResponse.json({ messages: messages || [] })
  } catch (err) {
    console.error('GET /chat/messages error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
