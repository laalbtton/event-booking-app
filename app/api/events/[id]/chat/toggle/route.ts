import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { userCanManageEventChatSettings } from '@/lib/eventChatPermissions'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function PATCH(
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

    // Verify caller is host/creator
    const { data: event } = await supabase
      .from('events')
      .select('id, host_user_id, created_by, slug')
      .eq('id', eventId)
      .maybeSingle()

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const canManage = await userCanManageEventChatSettings(supabase, eventId, userId, {
      host_user_id: event.host_user_id,
      created_by: event.created_by,
    })
    if (!canManage) {
      return NextResponse.json(
        { error: 'Only the host, event creator, platform admin, or a community admin for this event can modify chat settings' },
        { status: 403 }
      )
    }

    const updates: Record<string, unknown> = {}
    if (typeof body.chat_enabled === 'boolean') updates.chat_enabled = body.chat_enabled
    if (body.chat_mode === 'open' || body.chat_mode === 'host_only') updates.chat_mode = body.chat_mode

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('events')
      .update(updates)
      .eq('id', eventId)

    if (updateError) throw updateError

    if (event.slug) revalidatePath(`/events/${event.slug}`)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('PATCH /chat/toggle error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
