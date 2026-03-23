import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/server/push'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(
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
    const content = typeof body.content === 'string' ? body.content.trim() : ''

    if (!content || content.length > 1000) {
      return NextResponse.json({ error: 'content must be 1–1000 characters' }, { status: 400 })
    }

    // Load event chat settings
    const { data: event } = await supabase
      .from('events')
      .select('id, title, slug, host_user_id, created_by, chat_enabled, chat_mode')
      .eq('id', eventId)
      .maybeSingle()

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    if (!event.chat_enabled) return NextResponse.json({ error: 'Chat is disabled for this event' }, { status: 403 })

    const isHost = event.host_user_id === userId || event.created_by === userId

    // In host_only mode only the host/creator may send
    if (event.chat_mode === 'host_only' && !isHost) {
      return NextResponse.json({ error: 'Only the host can send messages in this chat' }, { status: 403 })
    }

    // Verify sender is a confirmed performer (or is host)
    if (!isHost) {
      const { data: booking } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .eq('status', 'confirmed')
        .eq('booking_scope', 'performer')
        .maybeSingle()

      if (!booking) return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Insert the message
    const { data: message, error: insertError } = await supabase
      .from('event_chat_messages')
      .insert({ event_id: eventId, user_id: userId, content })
      .select('id, content, created_at, user_id, profiles:user_id(display_name, avatar_url)')
      .single()

    if (insertError) throw insertError

    // Fan-out push notifications to other confirmed performers (non-blocking)
    fanOutNotifications(eventId, userId, event.title, event.slug, content).catch((err) =>
      console.error('chat push fanout error:', err)
    )

    return NextResponse.json({ message })
  } catch (err) {
    console.error('POST /chat/send error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function fanOutNotifications(
  eventId: string,
  senderId: string,
  eventTitle: string,
  eventSlug: string | null,
  content: string
) {
  // Create a fresh admin client inside the helper to avoid SupabaseClient generic type conflicts
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return
  const client = createClient(url, key)

  // Get all confirmed performers (minus sender)
  const { data: bookings } = await client
    .from('bookings')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .eq('booking_scope', 'performer')
    .neq('user_id', senderId)

  if (!bookings || bookings.length === 0) return

  const recipientIds = bookings.map((b: { user_id: string }) => b.user_id)

  // Fetch muted prefs
  const { data: mutedPrefs } = await client
    .from('event_chat_notification_prefs')
    .select('user_id')
    .eq('event_id', eventId)
    .eq('enabled', false)
    .in('user_id', recipientIds)

  const mutedSet = new Set((mutedPrefs || []).map((p: { user_id: string }) => p.user_id))

  const eventUrl = eventSlug ? `/events/${eventSlug}` : `/events/${eventId}`
  const truncated = content.length > 80 ? content.slice(0, 77) + '…' : content

  for (const recipientId of recipientIds) {
    if (mutedSet.has(recipientId)) continue
    sendPushToUser(client, recipientId, {
      title: `New message in ${eventTitle}`,
      body: truncated,
      data: { url: eventUrl },
    }, 'booking_updates').catch(() => {})
  }
}
