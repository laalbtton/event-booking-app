/**
 * GET /api/community-commands/communities
 * Lists communities the caller can run Community Commands against.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import {
  listManagedCommunities,
  userCanAccessCommunityCommands,
} from '@/lib/server/communityCommands'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await userCanAccessCommunityCommands(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const communities = await listManagedCommunities(supabase, user.id)
    return NextResponse.json({ communities })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[community-commands/communities]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
