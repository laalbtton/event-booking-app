import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// DELETE /api/profile-reviews/[id]
// Reviewer can delete their own review.
// Credits are forfeited via the DB after-delete trigger.
//
// Edge cases handled:
//  - Not authenticated → 401
//  - Review not found → 404
//  - Reviewer is not the owner → 403
//  - DB error → 500
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: reviewId } = await params

    // Fetch the review first to verify ownership
    const { data: review, error: fetchError } = await supabase
      .from('profile_reviews')
      .select('id, reviewer_id, ratee_id')
      .eq('id', reviewId)
      .maybeSingle()

    if (fetchError) return NextResponse.json({ error: 'Could not look up review' }, { status: 500 })
    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

    if (review.reviewer_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden: you can only delete your own reviews' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('profile_reviews')
      .delete()
      .eq('id', reviewId)

    if (deleteError) {
      return NextResponse.json({ error: 'Could not delete review' }, { status: 500 })
    }

    revalidatePath(`/profile/${review.ratee_id}`)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('DELETE /api/profile-reviews/[id] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

// PATCH /api/profile-reviews/[id]
// Reviewer can update the rating or comment on their own review.
// Updating does not change credits (already granted or not).
//
// Edge cases handled:
//  - Not authenticated → 401
//  - Review not found → 404
//  - Reviewer is not the owner → 403
//  - Invalid rating value → 400
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: reviewId } = await params
    const body = await request.json().catch(() => ({}))

    const { data: review } = await supabase
      .from('profile_reviews')
      .select('id, reviewer_id, ratee_id')
      .eq('id', reviewId)
      .maybeSingle()

    if (!review) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    if (review.reviewer_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates: Record<string, unknown> = {}

    if (body?.rating !== undefined) {
      const rating = Number(body.rating)
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return NextResponse.json({ error: 'rating must be between 1 and 5' }, { status: 400 })
      }
      updates.rating = Math.floor(rating)
    }

    if (body?.comment !== undefined) {
      updates.comment =
        typeof body.comment === 'string' && body.comment.trim().length > 0
          ? body.comment.trim().slice(0, 2000)
          : null
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('profile_reviews')
      .update(updates)
      .eq('id', reviewId)
      .select('*')
      .single()

    if (updateError) return NextResponse.json({ error: 'Could not update review' }, { status: 500 })

    revalidatePath(`/profile/${review.ratee_id}`)

    return NextResponse.json({ review: updated })
  } catch (err: unknown) {
    console.error('PATCH /api/profile-reviews/[id] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
