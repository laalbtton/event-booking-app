import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

    const { id: communityId } = await params

    // Must be a member
    const { data: membership } = await supabase
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', authData.user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: "You must be a member to tap Can't Wait" }, { status: 403 })
    }

    // Idempotent — only count once per user
    const { error: tapError } = await supabase
      .from('community_cant_wait_taps')
      .insert({ community_id: communityId, user_id: authData.user.id })

    if (tapError && tapError.code === '23505') {
      return NextResponse.json({ success: true, alreadyTapped: true })
    }
    if (tapError) return NextResponse.json({ error: tapError.message }, { status: 400 })

    // Increment counter: fetch current value then update
    const { data: current } = await supabase
      .from('communities')
      .select('cant_wait_count')
      .eq('id', communityId)
      .single()

    if (current) {
      await supabase
        .from('communities')
        .update({ cant_wait_count: ((current as { cant_wait_count: number }).cant_wait_count || 0) + 1 })
        .eq('id', communityId)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
