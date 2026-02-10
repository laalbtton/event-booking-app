import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { eventId, maxUses, expiresAt } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, created_by, host_user_id, event_type')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    if (event.event_type !== 'booked_show') {
      return NextResponse.json({ error: 'Invite links only apply to booked shows' }, { status: 400 })
    }

    const canManage =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id

    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const maxUsesValue = typeof maxUses === 'number' && maxUses > 0 ? maxUses : 12
    const expiresAtValue = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const tokenValue = generateToken()

    const { data: link, error: linkError } = await supabase
      .from('event_invite_links')
      .insert({
        event_id: eventId,
        token: tokenValue,
        max_uses: maxUsesValue,
        uses: 0,
        expires_at: expiresAtValue.toISOString(),
        created_by: authData.user.id,
      })
      .select()
      .single()

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, link })
  } catch (error: any) {
    console.error('Error creating invite link:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
