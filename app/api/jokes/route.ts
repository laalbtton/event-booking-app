import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToAllUsers } from '@/lib/server/push'

const MAX_CHARS = 280

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
