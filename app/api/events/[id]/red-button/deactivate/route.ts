/**
 * POST /api/events/[id]/red-button/deactivate
 *
 * Host-only. Ends the active Red Button Promo session.
 * Randomly selects one winner from all participants (anyone who submitted a
 * response, correct or not) and notifies the host.
 *
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

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

    // Get the active session
    const { data: session } = await supabase
      .from('red_button_sessions')
      .select('id, host_user_id, event_id')
      .eq('event_id', eventId)
      .eq('active', true)
      .single()

    if (!session) return NextResponse.json({ error: 'No active session found' }, { status: 404 })
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (session.host_user_id !== userId && !adminRow) {
      return NextResponse.json({ error: 'Only the event host can deactivate the Red Button' }, { status: 403 })
    }

    // Deactivate the session
    await supabase
      .from('red_button_sessions')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('id', session.id)

    // Fetch all responses to pick a lucky draw winner
    const { data: responses } = await supabase
      .from('red_button_responses')
      .select('user_id')
      .eq('session_id', session.id)

    if (!responses || responses.length === 0) {
      return NextResponse.json({ sessionId: session.id, totalResponses: 0, winner: null })
    }

    // Pick a random winner from all participants
    const winnerEntry = responses[Math.floor(Math.random() * responses.length)]
    const winnerId = winnerEntry.user_id

    // Fetch winner's name
    const { data: winnerProfile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', winnerId)
      .single()
    const winnerName = winnerProfile?.full_name ?? 'A participant'

    // Store the winner on the session
    await supabase
      .from('red_button_sessions')
      .update({ winner_user_id: winnerId })
      .eq('id', session.id)

    // Notify the host
    await createNotification(
      userId,
      'general',
      'Red Button Lucky Draw Winner',
      `The lucky draw winner is ${winnerName}. Tap "Approve" on the attendance page to issue their Free Chai coupon.`,
      null,
      eventId,
    )

    return NextResponse.json({
      sessionId: session.id,
      totalResponses: responses.length,
      winner: { id: winnerId, name: winnerName },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[red-button/deactivate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
