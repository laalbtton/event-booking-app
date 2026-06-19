import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { sendPushToUser } from '@/lib/server/push'
import { sendEmail, getNewReviewReceivedEmail } from '@/lib/email'
import { getSiteUrl } from '@/lib/server/emailUrl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// POST /api/profile-reviews
// Body: { rateeId, rating, comment?, eventContextId?, isAnonymous? }
// Returns: { review }
//
// After successful insert:
//   1. In-app notification → ratee
//   2. Push notification   → ratee (bypass category prefs — reviews are important)
//   3. Email               → ratee
//
// All three are fire-and-forget; a notification failure never fails the review itself.
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
    const isAnonymous: boolean = body?.isAnonymous === true

    if (!rateeId) return NextResponse.json({ error: 'rateeId is required' }, { status: 400 })
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json({ error: 'rating must be an integer between 1 and 5' }, { status: 400 })
    }
    if (reviewerId === rateeId) {
      return NextResponse.json({ error: 'You cannot review yourself' }, { status: 400 })
    }

    // Verify ratee exists and grab their email + name for notifications
    const { data: rateeProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', rateeId)
      .maybeSingle()

    if (!rateeProfile) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Grab reviewer name (for non-anonymous notifications)
    const { data: reviewerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', reviewerId)
      .maybeSingle()
    const reviewerName: string | null = reviewerProfile?.full_name ?? null

    // Check for duplicate
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
      is_anonymous: isAnonymous,
    }
    if (eventContextId) payload.event_context_id = eventContextId

    const { data: review, error: insertError } = await supabase
      .from('profile_reviews')
      .insert(payload)
      .select('*')
      .single()

    if (insertError) {
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

    // ── Fire-and-forget notifications ─────────────────────────────────────
    void sendReviewNotifications({
      supabase,
      rateeId,
      rateeName: rateeProfile.full_name ?? 'there',
      rateeEmail: rateeProfile.email ?? null,
      reviewerName: isAnonymous ? null : reviewerName,
      rating: Math.floor(rating),
      comment,
      reviewId: review.id,
    }).catch((err) => console.error('Review notification error:', err))

    return NextResponse.json({ review }, { status: 201 })
  } catch (err: unknown) {
    console.error('POST /api/profile-reviews error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

// ── Notification helper ────────────────────────────────────────────────────

async function sendReviewNotifications(opts: {
  supabase: AnySupabase
  rateeId: string
  rateeName: string
  rateeEmail: string | null
  reviewerName: string | null   // null when anonymous
  rating: number
  comment: string | null
  reviewId: string
}) {
  const { supabase, rateeId, rateeName, rateeEmail, reviewerName, rating, comment, reviewId } = opts

  const fromLabel = reviewerName ? reviewerName : 'Someone'
  const notifTitle = `${fromLabel} reviewed your profile`
  const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating)
  const notifBody = comment
    ? `${stars} — "${comment.slice(0, 100)}${comment.length > 100 ? '…' : ''}"`
    : stars

  // 1. In-app notification (direct insert; service role bypasses RLS)
  try {
    await supabase.from('notifications').insert({
      user_id: rateeId,
      type: 'profile_review_received',
      title: notifTitle,
      message: notifBody,
      read: false,
    })
  } catch (e) {
    console.error('In-app notification failed for review', reviewId, e)
  }

  // 2. Push notification (bypass category prefs — reviews are always delivered)
  try {
    await sendPushToUser(
      supabase,
      rateeId,
      {
        title: notifTitle,
        body: notifBody,
        data: { url: `/profile/${rateeId}` },
      },
      'booking_updates',
      { bypassCategoryPrefs: true },
    )
  } catch (e) {
    console.error('Push notification failed for review', reviewId, e)
  }

  // 3. Email
  if (rateeEmail) {
    try {
      const profileUrl = `${getSiteUrl()}/profile/${rateeId}`
      const html = getNewReviewReceivedEmail({
        rateeName,
        reviewerName,
        rating,
        comment,
        profileUrl,
      })
      await sendEmail({
        to: rateeEmail,
        subject: reviewerName
          ? `${reviewerName} left you a review on One Mic Stand`
          : 'You received an anonymous review on One Mic Stand',
        html,
      })
    } catch (e) {
      console.error('Email notification failed for review', reviewId, e)
    }
  }
}
