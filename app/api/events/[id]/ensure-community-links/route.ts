import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensureApprovedCommunityLinksForEvent } from '@/lib/server/ensureEventCommunityLinks'

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

    const { data: event, error: evErr } = await supabase
      .from('events')
      .select('id, status, created_by')
      .eq('id', eventId)
      .maybeSingle()

    if (evErr || !event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const typed = event as { id: string; status: string; created_by: string | null }

    if (!['active', 'pending_approval'].includes(typed.status)) {
      return NextResponse.json(
        { error: 'Only active or pending-approval events can be linked to communities.' },
        { status: 400 }
      )
    }

    if (!typed.created_by) {
      return NextResponse.json({ error: 'Event has no creator' }, { status: 400 })
    }

    const userId = authData.user.id

    const [{ data: profile }, { data: adminRow }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
      supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    ])

    const isPlatformAdmin =
      (profile as { role?: string } | null)?.role === 'admin' || !!adminRow

    if (!isPlatformAdmin && typed.created_by !== userId) {
      return NextResponse.json({ error: 'Only the event creator or a platform admin can link communities.' }, { status: 403 })
    }

    const result = await ensureApprovedCommunityLinksForEvent(supabase, eventId, typed.created_by)

    return NextResponse.json({
      success: true,
      linked: result.linked,
      upgraded: result.upgraded,
      communitiesTargeted: result.membershipCommunities,
    })
  } catch (err: unknown) {
    console.error('ensure-community-links:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
