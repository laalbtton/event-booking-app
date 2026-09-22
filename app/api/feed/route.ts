/**
 * GET /api/feed
 *
 * Signed-in: upcoming events from the user's communities and people they follow,
 * plus recent jokes from people they follow.
 * Guest: upcoming public events plus recent jokes from anyone.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import {
  getFeedEvents,
  getFeedJokes,
  getPublicFeedEvents,
  getPublicFeedJokes,
  listFollowingIds,
} from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))

    if (!user) {
      const [events, jokes] = await Promise.all([
        getPublicFeedEvents(supabase),
        getPublicFeedJokes(supabase),
      ])
      return NextResponse.json({ events, jokes, followingCount: 0, personalized: false })
    }

    const [events, jokes, followingIds] = await Promise.all([
      getFeedEvents(supabase, user.id),
      getFeedJokes(supabase, user.id),
      listFollowingIds(supabase, user.id),
    ])

    return NextResponse.json({
      events,
      jokes,
      followingCount: followingIds.length,
      personalized: true,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/feed]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
