/**
 * GET /api/events/[id]/red-button/status
 *
 * Host-only. Returns the current state of any active (or most recent)
 * Red Button session for this event: active, response count, winner info.
 *
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
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

    // Verify host
    const { data: event } = await supabase
      .from('events')
      .select('host_user_id')
      .eq('id', eventId)
      .single()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (event.host_user_id !== userId && !adminRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Get the most recent session for this event
    const { data: session } = await supabase
      .from('red_button_sessions')
      .select('id, active, winner_user_id, winner_approved, coupon_issued, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!session) {
      return NextResponse.json({ session: null })
    }

    // Get response count
    const { count: responseCount } = await supabase
      .from('red_button_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)

    // Get correct count
    const { count: correctCount } = await supabase
      .from('red_button_responses')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)
      .eq('correct', true)

    // Fetch winner name if set
    let winnerName: string | null = null
    if (session.winner_user_id) {
      const { data: wp } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', session.winner_user_id)
        .single()
      winnerName = wp?.full_name ?? null
    }

    return NextResponse.json({
      session: {
        id: session.id,
        active: session.active,
        responseCount: responseCount ?? 0,
        correctCount: correctCount ?? 0,
        winnerId: session.winner_user_id,
        winnerName,
        winnerApproved: session.winner_approved,
        couponIssued: session.coupon_issued,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[red-button/status]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
