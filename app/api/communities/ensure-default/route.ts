import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { ensureDefaultCommunityMemberships } from '@/lib/server/ensureDefaultCommunities'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(
      request.headers.get('authorization'),
    )
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const result = await ensureDefaultCommunityMemberships(supabase, user.id)
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    console.error('ensure-default communities error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
