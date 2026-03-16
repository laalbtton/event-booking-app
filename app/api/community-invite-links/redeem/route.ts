import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!authToken) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(authToken)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { token } = body
    if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 })

    const { data: link, error: linkError } = await supabase
      .from('community_invite_links')
      .select('id, community_id, target_role, max_uses, uses, expires_at')
      .eq('token', token)
      .single()

    if (linkError || !link) return NextResponse.json({ error: 'Invite link not found' }, { status: 404 })

    const typedLink = link as {
      id: string
      community_id: string
      target_role: string
      max_uses: number
      uses: number
      expires_at: string
    }

    if (new Date(typedLink.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This invite link has expired' }, { status: 410 })
    }

    if (typedLink.uses >= typedLink.max_uses) {
      return NextResponse.json({ error: 'This invite link has reached its limit' }, { status: 410 })
    }

    const userId = authData.user.id

    // Upsert community membership with the target role
    const { data: existingMembership } = await supabase
      .from('community_members')
      .select('id, role')
      .eq('community_id', typedLink.community_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingMembership) {
      // Only upgrade role, never downgrade
      const roleRank = { member: 1, event_creator: 2, co_admin: 3, admin: 4 }
      const currentRank = roleRank[existingMembership.role as keyof typeof roleRank] || 0
      const targetRank = roleRank[typedLink.target_role as keyof typeof roleRank] || 0
      if (targetRank > currentRank) {
        await supabase
          .from('community_members')
          .update({ role: typedLink.target_role })
          .eq('id', existingMembership.id)
      }
    } else {
      await supabase
        .from('community_members')
        .insert({
          community_id: typedLink.community_id,
          user_id: userId,
          role: typedLink.target_role,
        })
    }

    // Upgrade platform profile role to event_creator if target is event_creator or higher
    const upgradeRoles = ['event_creator', 'co_admin', 'admin']
    if (upgradeRoles.includes(typedLink.target_role)) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      const currentProfileRole = (profileData as { role?: string } | null)?.role
      // Only upgrade performer/audience to event_creator — never downgrade admins
      if (!currentProfileRole || currentProfileRole === 'performer' || currentProfileRole === 'audience') {
        await supabase
          .from('profiles')
          .update({ role: 'event_creator', updated_at: new Date().toISOString() })
          .eq('id', userId)
      }
    }

    // Increment use count
    await supabase
      .from('community_invite_links')
      .update({ uses: typedLink.uses + 1 })
      .eq('id', typedLink.id)

    // Fetch community name for the response
    const { data: community } = await supabase
      .from('communities')
      .select('id, name')
      .eq('id', typedLink.community_id)
      .single()

    return NextResponse.json({
      success: true,
      communityId: typedLink.community_id,
      communityName: (community as { name?: string } | null)?.name || '',
      role: typedLink.target_role,
    })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
