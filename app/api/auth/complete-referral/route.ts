/**
 * POST /api/auth/complete-referral
 *
 * Called from the onboarding page after a new user selects their role.
 * If the user arrived via a performer's public profile (?ref=<profileId>),
 * this route:
 *   1. Verifies the referrer is a performer / event_creator
 *   2. Sets profiles.referred_by for the new user (idempotent)
 *   3. Issues 2 Ryan's Chai venue credits to the referring performer
 *   4. Logs the credit transaction
 *   5. Sends the performer an in-app notification + push
 *
 * Body: { referrerId: string }
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendPushToUser } from '@/lib/server/push'

const REFERRAL_VENUE_CREDITS = 2

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()

    // Authenticate caller
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const newUserId = authData.user.id

    const body = await request.json().catch(() => ({}))
    const referrerId = typeof body.referrerId === 'string' ? body.referrerId.trim() : null
    if (!referrerId) {
      return NextResponse.json({ error: 'referrerId is required' }, { status: 400 })
    }

    // Prevent self-referral
    if (referrerId === newUserId) {
      return NextResponse.json({ error: 'Self-referral not allowed' }, { status: 400 })
    }

    // Check the new user hasn't already been attributed a referral
    const { data: newUserProfile } = await supabase
      .from('profiles')
      .select('referred_by, full_name')
      .eq('id', newUserId)
      .single()

    if (newUserProfile?.referred_by) {
      // Already attributed — idempotent, return success
      return NextResponse.json({ success: true, alreadySet: true })
    }

    // Verify the referrer is a performer / event_creator
    const { data: referrerProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('id', referrerId)
      .single()

    if (!referrerProfile) {
      return NextResponse.json({ error: 'Referrer not found' }, { status: 404 })
    }
    if (!['performer', 'event_creator'].includes(referrerProfile.role)) {
      return NextResponse.json({ error: 'Referrer is not a performer' }, { status: 400 })
    }

    // Find Ryan's Chai venue id
    const { data: venueRows } = await supabase
      .from('venues')
      .select('id, name')
      .ilike('name', "%ryan%chai%")
      .limit(1)

    const venueId = venueRows?.[0]?.id ?? null
    if (!venueId) {
      console.warn('[complete-referral] Ryan\'s Chai venue not found; skipping venue credits')
    }

    // Set referred_by for the new user
    await supabase
      .from('profiles')
      .update({ referred_by: referrerId })
      .eq('id', newUserId)

    if (venueId) {
      const now = new Date().toISOString()

      // Issue venue credit grant to the performer
      await supabase.from('venue_credit_grants').insert({
        user_id: referrerId,
        venue_id: venueId,
        credits_total: REFERRAL_VENUE_CREDITS,
        credits_remaining: REFERRAL_VENUE_CREDITS,
        notes: `Referral reward: ${newUserProfile?.full_name ?? 'New user'} joined via your profile`,
        issued_by: null,
        issued_at: now,
      })

      // Log the credit transaction
      await supabase.from('credit_transactions').insert({
        user_id: referrerId,
        amount: REFERRAL_VENUE_CREDITS,
        transaction_type: 'referral_reward',
        venue_id: venueId,
        notes: `Referral reward: new user joined from your profile`,
        created_at: now,
      })

      // In-app notification + push to the performer
      const newUserName = newUserProfile?.full_name ?? 'Someone'
      await createNotification(
        referrerId,
        'referral_credit_earned',
        "You earned Ryan's Chai credits!",
        `${newUserName} joined the app from your profile. You've earned ${REFERRAL_VENUE_CREDITS} Ryan's Chai credits.`,
      )
      await sendPushToUser(supabase, referrerId, {
        title: "You earned Ryan's Chai credits!",
        body: `${newUserName} joined via your profile. +${REFERRAL_VENUE_CREDITS} Ryan's Chai credits added.`,
        data: { url: '/credits' },
      }, 'booking_updates')
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[complete-referral]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
