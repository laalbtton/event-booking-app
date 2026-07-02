/**
 * POST /api/events/[id]/red-button/approve-winner
 *
 * Host-only. Approves the lucky draw winner and issues a Free Chai coupon
 * as a booking_voucher (voucher_type='lucky_draw', booking_id=null).
 * The coupon appears in the winner's Coupons tab on their profile page.
 *
 * Body: { sessionId: string }
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/server/push'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Generate a short, unique coupon code */
function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = 'CHAI-'
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
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
    if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

    // Load the session
    const { data: session } = await supabase
      .from('red_button_sessions')
      .select('id, event_id, host_user_id, winner_user_id, winner_approved, coupon_issued')
      .eq('id', sessionId)
      .single()

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (session.event_id !== eventId) return NextResponse.json({ error: 'Session does not match event' }, { status: 400 })
    if (session.host_user_id !== userId) return NextResponse.json({ error: 'Only the event host can approve' }, { status: 403 })
    if (!session.winner_user_id) return NextResponse.json({ error: 'No winner selected yet' }, { status: 400 })
    if (session.coupon_issued) return NextResponse.json({ success: true, alreadyIssued: true })

    const winnerId = session.winner_user_id

    // Find Ryan's Chai venue id
    const { data: venueRows } = await supabase
      .from('venues')
      .select('id, name')
      .ilike('name', "%ryan%chai%")
      .limit(1)
    const venueId = venueRows?.[0]?.id ?? null

    // Issue the Free Chai coupon (booking_id=null, voucher_type=lucky_draw)
    const code = generateCouponCode()
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString() // 90 days

    const { error: voucherError } = await supabase.from('booking_vouchers').insert({
      booking_id: null,
      event_id: eventId,
      user_id: winnerId,
      venue_id: venueId,
      code,
      value_cents: 0,
      voucher_type: 'lucky_draw',
      status: 'issued',
      expires_at: expiresAt,
      metadata: {
        description: "Free Chai at Ryan's Chai",
        prize: true,
        event_id: eventId,
      },
    })

    if (voucherError) {
      console.error('[red-button/approve-winner] voucher insert:', voucherError)
      return NextResponse.json({ error: 'Failed to issue coupon' }, { status: 500 })
    }

    // Mark session as winner approved + coupon issued
    await supabase
      .from('red_button_sessions')
      .update({ winner_approved: true, coupon_issued: true })
      .eq('id', sessionId)

    // Notify the winner
    await createNotification(
      winnerId,
      'red_button_lucky_draw_won',
      "You won a Free Chai at Ryan's Chai!",
      "You were selected as the lucky draw winner! Your Free Chai coupon is waiting in your Coupons tab.",
      null,
      eventId,
    )
    await sendPushToUser(supabase, winnerId, {
      title: "You won a Free Chai!",
      body: "Check your Coupons tab — your Free Chai at Ryan's Chai is ready to use.",
      data: { url: '/profile' },
    }, 'booking_updates')

    return NextResponse.json({ success: true, couponCode: code })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[red-button/approve-winner]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
