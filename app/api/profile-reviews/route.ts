import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// POST /api/profile-reviews
// Body: { rateeId, rating, comment?, eventContextId? }
// Returns: { review }
//
// Edge cases handled:
//  - Not authenticated → 401
//  - Missing / invalid rateeId or rating → 400
//  - Self-review → 400
//  - Duplicate review (same pair already exists) → 409
//  - No shared event relationship → 400 (raised by DB trigger)
//  - DB / unexpected error → 500
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const reviewerId = authData.user.id

    const body = await request.json().catch(() => ({}))
    const rateeId: string = typeof body?.rateeId === 'string' ? body.rateeId.trim() : ''
    const rating: number = Number(body?.rating)
    const comment: string | null =
      typeof body?.comment === 'string' && body.comment.trim().length > 0
        ? body.comment.trim().slice(0, 2000)
        : null
    const eventContextId: string | null =
      typeof body?.eventContextId === 'string' && body.eventContextId.trim().length > 0
        ? body.eventContextId.trim()
        : null

    if (!rateeId) return NextResponse.json({ error: 'rateeId is required' }, { status: 400 })
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
    }
    if (reviewerId === rateeId) {
      return NextResponse.json({ error: 'You cannot review yourself' }, { status: 400 })
    }

    // Verify ratee exists
    const { data: rateeProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', rateeId)
      .maybeSingle()

    if (!rateeProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Check for duplicate using SELECT first (friendlier 409 vs DB unique violation 500)
    const { data: existing } = await supabase
      .from('profile_reviews')
      .select('id')
      .eq('reviewer_id', reviewerId)
      .eq('ratee_id', rateeId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'You have already reviewed this person', reviewId: existing.id },
        { status: 409 },
      )
    }

    const payload: Record<string, unknown> = {
      reviewer_id: reviewerId,
      ratee_id: rateeId,
      rating: Math.floor(rating),
      comment,
    }
    if (eventContextId) payload.event_context_id = eventContextId

    const { data: review, error: insertError } = await supabase
      .from('profile_reviews')
      .insert(payload)
      .select('*')
      .single()

    if (insertError) {
      // Surface clean trigger-raised messages to the client
      const msg: string = insertError.message || ''
      const userFacing =
        msg.includes('You cannot review yourself') ||
        msg.includes('did not attend this event') ||
        msg.includes('The person you are reviewing') ||
        msg.includes('must have attended the same event')
      return NextResponse.json(
        { error: userFacing ? msg : 'Could not submit review' },
        { status: userFacing ? 400 : 500 },
      )
    }

    revalidatePath(`/profile/${rateeId}`)

    return NextResponse.json({ review }, { status: 201 })
  } catch (err: unknown) {
    console.error('POST /api/profile-reviews error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
