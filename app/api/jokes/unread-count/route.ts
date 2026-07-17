import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ count: 0 })
    }

    const { data: state } = await supabase
      .from('user_joke_tab_state')
      .select('last_viewed_at')
      .eq('user_id', user.id)
      .maybeSingle()

    // First-time users: seed "viewed now" so the badge only tracks new posts going forward
    if (!state?.last_viewed_at) {
      const now = new Date().toISOString()
      await supabase.from('user_joke_tab_state').upsert(
        {
          user_id: user.id,
          last_viewed_at: now,
          updated_at: now,
        },
        { onConflict: 'user_id' },
      )
      return NextResponse.json({ count: 0 })
    }

    const lastViewedAt = state.last_viewed_at

    const { count, error } = await supabase
      .from('jokes')
      .select('id', { count: 'exact', head: true })
      .gt('created_at', lastViewedAt)
      .neq('user_id', user.id)

    if (error) {
      // Table may not exist yet before migration
      console.error('jokes unread count error:', error)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (error: unknown) {
    console.error('GET /api/jokes/unread-count error:', error)
    return NextResponse.json({ count: 0 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date().toISOString()
    const { error } = await supabase.from('user_joke_tab_state').upsert(
      {
        user_id: user.id,
        last_viewed_at: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    )

    if (error) {
      console.error('mark jokes viewed error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, last_viewed_at: now })
  } catch (error: unknown) {
    console.error('POST /api/jokes/unread-count error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    )
  }
}
