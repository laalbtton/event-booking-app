/**
 * Follow / unfollow another user, and check follow state.
 *
 * GET    ?userId=<id>  → { following: boolean }
 * POST   { userId }    → follow
 * DELETE { userId }    → unfollow
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { followUser, isFollowing, notifyNewFollower, unfollowUser } from '@/lib/server/follows'

export async function GET(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const targetId = new URL(request.url).searchParams.get('userId')?.trim()
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    if (targetId === user.id) {
      return NextResponse.json({ following: false, self: true })
    }

    return NextResponse.json({
      following: await isFollowing(supabase, user.id, targetId),
      self: false,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/follows GET]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const targetId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const result = await followUser(supabase, user.id, targetId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    if (!result.alreadyFollowing) {
      await notifyNewFollower(supabase, user.id, targetId)
    }

    return NextResponse.json({ success: true, following: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/follows POST]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const targetId =
      (typeof body?.userId === 'string' ? body.userId.trim() : '') ||
      (new URL(request.url).searchParams.get('userId')?.trim() ?? '')
    if (!targetId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })

    const result = await unfollowUser(supabase, user.id, targetId)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })

    return NextResponse.json({ success: true, following: false })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/follows DELETE]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
