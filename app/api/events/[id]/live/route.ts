/**
 * GET /api/events/[id]/live
 *
 * Host or confirmed attendee. Returns performers, vote tallies, live performer,
 * own votes (attendees), and red-button status (secret code only for host).
 */

import { NextRequest, NextResponse } from 'next/server'
import { authenticateBearer, loadEventAccess } from '@/lib/server/eventLiveMode'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: eventId } = await params
    const auth = await authenticateBearer(request)
    if (auth.error) return auth.error
    const { supabase, userId } = auth

    const access = await loadEventAccess(supabase, eventId, userId)
    if (access.error) return access.error
    const { event, isHost, hasAudienceBooking } = access

    const { data: liveState } = await supabase
      .from('event_live_state')
      .select('live_performer_user_id, enabled, updated_at')
      .eq('event_id', eventId)
      .maybeSingle()

    const liveModeEnabled = liveState?.enabled === true

    // Attendees can only use Live Mode when the host has enabled it
    if (!isHost && !liveModeEnabled) {
      return NextResponse.json({ error: 'Live Mode is not enabled for this event' }, { status: 403 })
    }

    const { data: performerBookings } = await supabase
      .from('bookings')
      .select('user_id, profiles(id, full_name, avatar_url)')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .neq('booking_scope', 'audience')
      .order('booked_at', { ascending: true })

    const performersRaw = (performerBookings || []).map((b: any) => ({
      userId: b.user_id as string,
      fullName: (b.profiles?.full_name as string | null) || 'Performer',
      avatarUrl: (b.profiles?.avatar_url as string | null) || null,
    }))

    const seen = new Set<string>()
    const performers = performersRaw.filter((p) => {
      if (seen.has(p.userId)) return false
      seen.add(p.userId)
      return true
    })

    const { data: votes } = await supabase
      .from('event_performer_votes')
      .select('performer_user_id, vote, voter_user_id')
      .eq('event_id', eventId)

    const counts: Record<string, { green: number; red: number }> = {}
    for (const p of performers) {
      counts[p.userId] = { green: 0, red: 0 }
    }
    const myVotes: Record<string, 'green' | 'red'> = {}
    for (const v of votes || []) {
      if (!counts[v.performer_user_id]) counts[v.performer_user_id] = { green: 0, red: 0 }
      if (v.vote === 'green') counts[v.performer_user_id].green += 1
      if (v.vote === 'red') counts[v.performer_user_id].red += 1
      if (v.voter_user_id === userId && (v.vote === 'green' || v.vote === 'red')) {
        myVotes[v.performer_user_id] = v.vote
      }
    }

    const performersWithVotes = performers.map((p) => ({
      ...p,
      green: counts[p.userId]?.green ?? 0,
      red: counts[p.userId]?.red ?? 0,
      isLive: liveState?.live_performer_user_id === p.userId,
    }))

    const canUseRedButton = hasAudienceBooking

    const { data: rbSession } = await supabase
      .from('red_button_sessions')
      .select('id, active, secret_code, winner_user_id, winner_approved, coupon_issued, created_at')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let redButton: Record<string, unknown> | null = null
    if (rbSession) {
      const { count: responseCount } = await supabase
        .from('red_button_responses')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', rbSession.id)

      const { count: correctCount } = await supabase
        .from('red_button_responses')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', rbSession.id)
        .eq('correct', true)

      let myResponse: { correct: boolean; credits_issued: boolean } | null = null
      if (!isHost && canUseRedButton) {
        const { data: resp } = await supabase
          .from('red_button_responses')
          .select('correct, credits_issued')
          .eq('session_id', rbSession.id)
          .eq('user_id', userId)
          .maybeSingle()
        myResponse = resp
      }

      let winnerName: string | null = null
      if (rbSession.winner_user_id && isHost) {
        const { data: wp } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', rbSession.winner_user_id)
          .single()
        winnerName = wp?.full_name ?? null
      }

      redButton = {
        id: rbSession.id,
        active: rbSession.active,
        responseCount: responseCount ?? 0,
        correctCount: correctCount ?? 0,
        ...(isHost
          ? {
              code: rbSession.active ? rbSession.secret_code : null,
              winnerId: rbSession.winner_user_id,
              winnerName,
              winnerApproved: rbSession.winner_approved,
              couponIssued: rbSession.coupon_issued,
            }
          : {
              mySubmitted: !!myResponse,
              myCorrect: myResponse?.correct ?? null,
            }),
      }
    }

    return NextResponse.json({
      eventId: event.id,
      title: event.title,
      isHost,
      liveModeEnabled,
      canUseRedButton,
      livePerformerUserId: liveState?.live_performer_user_id ?? null,
      performers: performersWithVotes,
      myVotes: isHost ? undefined : myVotes,
      redButton,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[live GET]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
