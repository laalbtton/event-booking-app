/**
 * GET /api/profiles/search?q=<term>
 *
 * Find performers by name. Open to guests; signed-in callers also get follow state.
 * Response carries public-safe fields only.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { searchProfiles } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))

    const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
    const results = await searchProfiles(supabase, user?.id ?? null, query)

    return NextResponse.json({ results })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/profiles/search]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
