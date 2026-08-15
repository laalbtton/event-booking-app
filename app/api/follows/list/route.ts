/**
 * GET /api/follows/list
 *
 * The signed-in user's own following list, plus their own follower count.
 * Follower counts are never returned for anyone else — see sql/profile_follows_migration.sql.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { countMyFollowers, listFollowing } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [following, followerCount] = await Promise.all([
      listFollowing(supabase, user.id),
      countMyFollowers(supabase, user.id),
    ])

    return NextResponse.json({ following, followerCount })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/follows/list]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
