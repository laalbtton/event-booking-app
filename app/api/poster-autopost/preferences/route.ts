import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const eventId = request.nextUrl.searchParams.get('eventId')
    let query = supabase
      .from('poster_auto_post_prefs')
      .select('id, user_id, event_id, auto_post_enabled, created_at, updated_at')
      .eq('user_id', user.id)

    if (eventId) {
      query = query.eq('event_id', eventId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ preferences: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { eventId, enabled } = await request.json()
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be boolean' }, { status: 400 })
    }

    const payload = {
      user_id: user.id,
      event_id: eventId || null,
      auto_post_enabled: enabled,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('poster_auto_post_prefs')
      .upsert(payload, { onConflict: 'user_id,event_id' })
      .select('id, user_id, event_id, auto_post_enabled, created_at, updated_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, preference: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
