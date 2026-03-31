import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const { id: communityId } = await params

    const [{ data: membership }, { data: profile }, { data: adminFallback }] = await Promise.all([
      supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', authData.user.id)
        .maybeSingle(),
      supabase.from('profiles').select('role').eq('id', authData.user.id).maybeSingle(),
      supabase.from('admin_users').select('id').eq('user_id', authData.user.id).maybeSingle(),
    ])

    const isSuperAdmin =
      (profile as { role?: string } | null)?.role === 'admin' || !!adminFallback
    const isCommunityStaff = ['admin', 'co_admin'].includes(membership?.role || '')

    if (!isSuperAdmin && !isCommunityStaff) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    if (typeof body.autoApproveNewEvents !== 'boolean') {
      return NextResponse.json({ error: 'autoApproveNewEvents (boolean) is required' }, { status: 400 })
    }

    const { data: updated, error: upErr } = await supabase
      .from('communities')
      .update({
        auto_approve_new_events: body.autoApproveNewEvents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', communityId)
      .select('id, auto_approve_new_events')
      .maybeSingle()

    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
    if (!updated) return NextResponse.json({ error: 'Community not found' }, { status: 404 })

    return NextResponse.json({
      success: true,
      autoApproveNewEvents: (updated as { auto_approve_new_events: boolean }).auto_approve_new_events,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
