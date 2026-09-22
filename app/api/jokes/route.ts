import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToAllUsers } from '@/lib/server/push'

const MAX_CHARS = 280
const LOAD_LIMIT = 50

type ReactionType = 'like' | 'bomb' | 'kill' | 'laughter'

type RawTag = { id: string; user_id: string; content: string; created_at: string }
type RawReaction = { id: string; user_id: string; reaction_type: string }
type RawJoke = {
  id: string
  user_id: string
  content: string
  created_at: string
  joke_reactions: RawReaction[] | null
  joke_tags: RawTag[] | null
}

function serializeJokes(
  rows: RawJoke[],
  profileById: Map<string, { full_name: string | null; avatar_url: string | null }>,
  currentUserId: string | null,
) {
  return rows.map((row) => {
    const reactions = { like: 0, bomb: 0, kill: 0, laughter: 0 }
    let my_reaction: ReactionType | null = null
    for (const r of row.joke_reactions ?? []) {
      if (r.reaction_type === 'like') reactions.like++
      else if (r.reaction_type === 'bomb') reactions.bomb++
      else if (r.reaction_type === 'kill') reactions.kill++
      else if (r.reaction_type === 'laughter') reactions.laughter++
      if (currentUserId && r.user_id === currentUserId) {
        my_reaction = r.reaction_type as ReactionType
      }
    }
    const tags = [...(row.joke_tags ?? [])]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((t) => ({
        id: t.id,
        user_id: t.user_id,
        content: t.content,
        created_at: t.created_at,
        author_name: profileById.get(t.user_id)?.full_name ?? null,
      }))
    const author = profileById.get(row.user_id)
    return {
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      created_at: row.created_at,
      author_name: author?.full_name ?? null,
      author_avatar_url: author?.avatar_url ?? null,
      reactions,
      my_reaction,
      tags,
    }
  })
}

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    const mine = new URL(request.url).searchParams.get('mine') === '1'
    if (mine && !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let query = supabase
      .from('jokes')
      .select(
        'id, user_id, content, created_at, joke_reactions(id, user_id, reaction_type), joke_tags(id, user_id, content, created_at)',
      )
      .order('created_at', { ascending: false })

    if (mine && user) {
      query = query.eq('user_id', user.id)
    } else {
      query = query.limit(LOAD_LIMIT)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const rows = (data ?? []) as RawJoke[]
    const profileIds = [
      ...new Set([
        ...rows.map((r) => r.user_id),
        ...rows.flatMap((r) => (r.joke_tags ?? []).map((t) => t.user_id)),
      ]),
    ]
    const profileById = new Map<string, { full_name: string | null; avatar_url: string | null }>()
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', profileIds)
      for (const p of (profiles ?? []) as {
        id: string
        full_name: string | null
        avatar_url: string | null
      }[]) {
        profileById.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
      }
    }

    return NextResponse.json({
      jokes: serializeJokes(rows, profileById, user?.id ?? null),
    })
  } catch (error: unknown) {
    console.error('GET /api/jokes error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content || content.length > MAX_CHARS) {
      return NextResponse.json(
        { error: `Joke must be 1–${MAX_CHARS} characters` },
        { status: 400 },
      )
    }

    const { data: joke, error } = await supabase
      .from('jokes')
      .insert({ user_id: user.id, content })
      .select('id, user_id, content, created_at')
      .single()

    if (error || !joke) {
      return NextResponse.json({ error: error?.message || 'Failed to post joke' }, { status: 500 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()

    const authorName = profile?.full_name?.trim() || 'Someone'
    const preview = content.length > 80 ? `${content.slice(0, 77)}…` : content

    // Fire-and-forget push to everyone (respects jokes_notifications_enabled)
    void sendPushToAllUsers(
      supabase,
      {
        title: `${authorName} posted a joke`,
        body: preview,
        data: { url: '/jokes', route: '/jokes' },
      },
      'jokes',
    ).catch((err) => console.error('Joke push failed:', err))

    return NextResponse.json({
      joke: {
        ...joke,
        joke_reactions: [],
        joke_tags: [],
      },
    })
  } catch (error: unknown) {
    console.error('POST /api/jokes error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Server error' },
      { status: 500 },
    )
  }
}
