import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

const MAX_TAG_CHARS = 140
const MAX_TAGS = 5

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id: jokeId } = await context.params
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content || content.length > MAX_TAG_CHARS) {
      return NextResponse.json(
        { error: `Tag must be 1–${MAX_TAG_CHARS} characters` },
        { status: 400 },
      )
    }

    const { count, error: countError } = await supabase
      .from('joke_tags')
      .select('id', { count: 'exact', head: true })
      .eq('joke_id', jokeId)

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 })
    }
    if ((count ?? 0) >= MAX_TAGS) {
      return NextResponse.json({ error: `Maximum of ${MAX_TAGS} tags per joke` }, { status: 400 })
    }

    const { data: tag, error } = await supabase
      .from('joke_tags')
      .insert({ joke_id: jokeId, user_id: user.id, content })
      .select('id, joke_id, user_id, content, created_at')
      .single()

    if (error || !tag) {
      const msg = error?.message || 'Failed to add tag'
      if (msg.toLowerCase().includes('maximum of 5')) {
        return NextResponse.json({ error: `Maximum of ${MAX_TAGS} tags per joke` }, { status: 400 })
      }
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()

    return NextResponse.json({
      tag: {
        ...tag,
        author_name: profile?.full_name ?? null,
        author_avatar_url: profile?.avatar_url ?? null,
      },
    })
  } catch (error: unknown) {
    console.error('POST /api/jokes/[id]/tags error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    )
  }
}
