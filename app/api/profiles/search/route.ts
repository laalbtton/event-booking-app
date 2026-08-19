/**
 * GET /api/profiles/search?q=<term>
 *
 * Find people to follow. Unlike /api/admin/users/search this is open to every
 * signed-in user, so the response carries public-safe fields only.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { searchProfiles } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    const results = await searchProfiles(supabase, user.id, query)

    return NextResponse.json({ results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/profiles/search]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
