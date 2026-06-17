import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { FOUNDING_MEMBER_LIMIT } from '@/lib/foundingMembers'

export const dynamic = 'force-dynamic'

/** Public spots-remaining counter for the founding member scarcity component. */
export async function GET() {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({
        limit: FOUNDING_MEMBER_LIMIT,
        claimed: 0,
        remaining: FOUNDING_MEMBER_LIMIT,
      })
    }

    const { count } = await supabase
      .from('founding_members')
      .select('id', { count: 'exact', head: true })

    const claimed = count ?? 0
    const remaining = Math.max(0, FOUNDING_MEMBER_LIMIT - claimed)

    return NextResponse.json({ limit: FOUNDING_MEMBER_LIMIT, claimed, remaining })
  } catch {
    return NextResponse.json({
      limit: FOUNDING_MEMBER_LIMIT,
      claimed: 0,
      remaining: FOUNDING_MEMBER_LIMIT,
    })
  }
}
