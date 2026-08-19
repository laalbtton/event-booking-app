/**
 * GET /api/feed
 *
 * Upcoming events from the user's communities and from people they follow, plus
 * recent jokes written by the people they follow.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { getFeedEvents, getFeedJokes, listFollowingIds } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const [events, jokes, followingIds] = await Promise.all([
      getFeedEvents(supabase, user.id),
      getFeedJokes(supabase, user.id),
      listFollowingIds(supabase, user.id),
    ])

    return NextResponse.json({ events, jokes, followingCount: followingIds.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/feed]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
