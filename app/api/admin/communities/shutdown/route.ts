import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

async function isSuperAdmin(supabase: ReturnType<typeof createClient>, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if ((profile as { role?: string } | null)?.role === 'admin') return true
  const { data: adminUser } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).single()
  return Boolean(adminUser)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isSuperAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { communityId, reason } = body

    if (!communityId) return NextResponse.json({ error: 'communityId is required' }, { status: 400 })

    const { data: community } = await supabase
      .from('communities')
      .select('id, name, status')
      .eq('id', communityId)
      .single()

    if (!community) return NextResponse.json({ error: 'Community not found' }, { status: 404 })
    if ((community as { status: string }).status === 'archived') {
      return NextResponse.json({ error: 'Community is already archived' }, { status: 400 })
    }

    await supabase
      .from('communities')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('id', communityId)

    // Notify all members
    const { data: members } = await supabase
      .from('community_members')
      .select('user_id')
      .eq('community_id', communityId)

    const communityName = (community as { name: string }).name

    for (const member of (members || []) as { user_id: string }[]) {
      await supabase.rpc('create_notification', {
        p_user_id: member.user_id,
        p_type: 'general',
        p_title: `Community Closed: ${communityName}`,
        p_message: `The community "${communityName}" has been shut down by an administrator.${reason ? ` Reason: ${reason}` : ''}`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
