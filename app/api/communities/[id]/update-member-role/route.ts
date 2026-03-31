import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const ALLOWED_ROLES = ['member', 'event_creator', 'co_admin', 'admin'] as const
type CommunityRole = (typeof ALLOWED_ROLES)[number]

function isAllowedRole(r: string): r is CommunityRole {
  return (ALLOWED_ROLES as readonly string[]).includes(r)
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

    const { id: communityId } = await params

    const { data: reviewerMembership } = await supabase
      .from('community_members')
      .select('role')
      .eq('community_id', communityId)
      .eq('user_id', authData.user.id)
      .maybeSingle()

    const [{ data: reviewerProfile }, { data: adminFallbackRow }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', authData.user.id).maybeSingle(),
      supabase.from('admin_users').select('id').eq('user_id', authData.user.id).maybeSingle(),
    ])

    const isSuperAdmin =
      (reviewerProfile as { role?: string } | null)?.role === 'admin' || !!adminFallbackRow

    const isCommunityAdmin = reviewerMembership?.role === 'admin'

    if (!isSuperAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: 'Only the community admin can change member roles.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const targetUserId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    const newRole = typeof body?.role === 'string' ? body.role.trim() : ''

    if (!targetUserId || !isAllowedRole(newRole)) {
      return NextResponse.json({ error: 'userId and a valid role are required.' }, { status: 400 })
    }

    const { data: targetRow, error: targetErr } = await supabase
      .from('community_members')
      .select('id, role')
      .eq('community_id', communityId)
      .eq('user_id', targetUserId)
      .maybeSingle()

    if (targetErr || !targetRow) {
      return NextResponse.json({ error: 'Member not found in this community.' }, { status: 404 })
    }

    const currentRole = (targetRow as { role: string }).role
    if (currentRole === 'admin' && !isSuperAdmin) {
      return NextResponse.json({ error: 'Cannot change another community admin.' }, { status: 403 })
    }

    const { data: updated, error: updateErr } = await supabase
      .from('community_members')
      .update({ role: newRole })
      .eq('community_id', communityId)
      .eq('user_id', targetUserId)
      .select('id, user_id, role')
      .maybeSingle()

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 400 })
    }
    if (!updated) {
      return NextResponse.json({ error: 'Update failed.' }, { status: 500 })
    }

    return NextResponse.json({ success: true, member: updated })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
