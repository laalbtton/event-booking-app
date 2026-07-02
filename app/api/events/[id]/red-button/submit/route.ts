/**
 * POST /api/events/[id]/red-button/submit
 *
 * Authenticated confirmed attendee submits their number guess.
 * The secret code is checked server-side — never sent to the client.
 * Correct answers earn 2 Ryan's Chai venue credits (once per session).
 *
 * Body: { sessionId: string, guess: number }
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/server/push'

const CORRECT_VENUE_CREDITS = 2

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: eventId } = await params
    const supabase = getAdminClient()

    // Authenticate
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = authData.user.id

    const body = await request.json().catch(() => ({}))
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null
    const guess = typeof body.guess === 'number' ? body.guess : parseInt(body.guess, 10)

    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    if (isNaN(guess)) return NextResponse.json({ error: 'guess must be a number' }, { status: 400 })

    // Load the active session (includes secret_code — service role bypasses RLS)
    const { data: session } = await supabase
      .from('red_button_sessions')
      .select('id, event_id, secret_code, active')
      .eq('id', sessionId)
      .single()

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.event_id !== eventId) return NextResponse.json({ error: 'Session does not match event' }, { status: 400 })
    if (!session.active) return NextResponse.json({ error: 'This promo has ended' }, { status: 400 })

    // Verify the caller has a confirmed booking for this event
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .maybeSingle()

    if (!booking) {
      return NextResponse.json({ error: 'You must be a confirmed attendee to participate' }, { status: 403 })
    }

    // Check if user already responded
    const { data: existing } = await supabase
      .from('red_button_responses')
      .select('id, correct, credits_issued')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ correct: existing.correct, alreadySubmitted: true })
    }

    const correct = guess === session.secret_code

    // Insert the response
    await supabase.from('red_button_responses').insert({
      session_id: sessionId,
      user_id: userId,
      correct,
      credits_issued: false,
    })

    // If correct, issue 2 Ryan's Chai venue credits
    if (correct) {
      const { data: venueRows } = await supabase
        .from('venues')
        .select('id')
        .ilike('name', "%ryan%chai%")
        .limit(1)
      const venueId = venueRows?.[0]?.id ?? null

      if (venueId) {
        const now = new Date().toISOString()

        await supabase.from('venue_credit_grants').insert({
          user_id: userId,
          venue_id: venueId,
          credits_total: CORRECT_VENUE_CREDITS,
          credits_remaining: CORRECT_VENUE_CREDITS,
          notes: 'Red Button Promo — correct number',
          issued_at: now,
        })

        await supabase.from('credit_transactions').insert({
          user_id: userId,
          amount: CORRECT_VENUE_CREDITS,
          transaction_type: 'red_button_reward',
          venue_id: venueId,
          notes: 'Red Button Promo — correct number',
          reference_id: sessionId,
          created_at: now,
        })

        // Mark credits issued on the response
        await supabase
          .from('red_button_responses')
          .update({ credits_issued: true })
          .eq('session_id', sessionId)
          .eq('user_id', userId)

        await createNotification(
          userId,
          'red_button_credits_earned',
          "You got it! +2 Ryan's Chai credits",
          `You entered the correct number and earned ${CORRECT_VENUE_CREDITS} Ryan's Chai credits!`,
          null,
          eventId,
        )
        await sendPushToUser(supabase, userId, {
          title: "You got it right!",
          body: `+${CORRECT_VENUE_CREDITS} Ryan's Chai credits added to your account.`,
          data: { url: '/credits' },
        }, 'booking_updates')
      }
    }

    return NextResponse.json({ correct })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[red-button/submit]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
