import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
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

    const body = await request.json().catch(() => ({}))
    const { communityId, targetRole = 'event_creator', maxUses = 50, expiresInDays = 30 } = body

    if (!communityId) return NextResponse.json({ error: 'communityId is required' }, { status: 400 })

    // Must be community admin/co-admin or platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .single()

    const isPlatformAdmin = (profile as { role?: string } | null)?.role === 'admin'

    if (!isPlatformAdmin) {
      const { data: membership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', authData.user.id)
        .single()

      if (!['admin', 'co_admin'].includes(membership?.role || '')) {
        return NextResponse.json({ error: 'Must be community admin to create invite links' }, { status: 403 })
      }
    }

    const linkToken = crypto.randomBytes(20).toString('hex')
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()

    const { data: link, error: insertError } = await supabase
      .from('community_invite_links')
      .insert({
        community_id: communityId,
        token: linkToken,
        target_role: targetRole,
        max_uses: maxUses,
        uses: 0,
        expires_at: expiresAt,
        created_by: authData.user.id,
      })
      .select()
      .single()

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

    return NextResponse.json({ success: true, link })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
