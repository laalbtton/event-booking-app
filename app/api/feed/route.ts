/**
 * GET /api/feed
 *
 * Upcoming events from the user's communities and from people they follow.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { getFeedEvents, listFollowingIds } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [events, followingIds] = await Promise.all([
      getFeedEvents(supabase, user.id),
      listFollowingIds(supabase, user.id),
    ])

    return NextResponse.json({ events, followingCount: followingIds.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/feed]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
