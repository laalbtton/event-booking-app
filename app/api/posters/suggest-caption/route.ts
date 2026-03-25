import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { buildDefaultPosterCaption } from '@/lib/posterCaption'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { eventId } = await request.json().catch(() => ({}))
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, location, event_type, theme, languages, tickets_enabled, external_event, external_ticket_url, credits_required, created_by, host_user_id')
      .eq('id', eventId)
      .single()

    if (eventError || !eventRow) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const { data: adminLink } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    const canManage =
      profile?.role === 'admin' ||
      !!adminLink ||
      eventRow.created_by === user.id ||
      eventRow.host_user_id === user.id

    if (!canManage) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const caption = buildDefaultPosterCaption({
      title: eventRow.title,
      date: (eventRow as any).date,
      location: (eventRow as any).location,
      event_type: (eventRow as any).event_type,
      theme: (eventRow as any).theme,
      languages: (eventRow as any).languages,
      tickets_enabled: (eventRow as any).tickets_enabled,
      external_event: (eventRow as any).external_event,
      external_ticket_url: (eventRow as any).external_ticket_url,
      credits_required: (eventRow as any).credits_required,
    })

    return NextResponse.json({ caption })
  } catch (error: any) {
    console.error('Error suggesting poster caption:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
