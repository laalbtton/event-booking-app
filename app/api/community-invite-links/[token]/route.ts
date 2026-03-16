import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const { token } = await params

    const { data: link, error } = await supabase
      .from('community_invite_links')
      .select('id, community_id, target_role, max_uses, uses, expires_at')
      .eq('token', token)
      .single()

    if (error || !link) return NextResponse.json({ error: 'Invite link not found' }, { status: 404 })

    if (new Date((link as { expires_at: string }).expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 })
    }

    const typedLink = link as { community_id: string; uses: number; max_uses: number; target_role: string; expires_at: string }

    if (typedLink.uses >= typedLink.max_uses) {
      return NextResponse.json({ error: 'This invite link has reached its limit' }, { status: 410 })
    }

    // Fetch community info
    const { data: community } = await supabase
      .from('communities')
      .select('id, name, description, location, slug')
      .eq('id', typedLink.community_id)
      .single()

    return NextResponse.json({
      community,
      targetRole: typedLink.target_role,
      expiresAt: typedLink.expires_at,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
