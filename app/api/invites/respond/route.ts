import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { hasEnoughCredits, splitDeduction, getEffectiveCreditBalances, getSpendableRegularCredits } from '@/lib/creditLedger'
import { applyVenueCreditGrants } from '@/lib/server/venueCreditGrants'
import { canAffordWithVenueCredits, venueCreditsForEvent } from '@/lib/venueCredits'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json(
        { error: 'Missing Supabase environment variables' },
        { status: 500 }
      )
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { inviteId, action } = await request.json()
    if (!inviteId || (action !== 'accept' && action !== 'decline')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const { data: invite, error: inviteError } = await supabase
      .from('event_invites')
      .select('id, event_id, invited_user_id, status')
      .eq('id', inviteId)
      .single()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    if (invite.invited_user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (invite.status !== 'pending') {
      return NextResponse.json({ error: 'Invite already handled' }, { status: 400 })
    }

    if (action === 'decline') {
      const { error: declineError } = await supabase
        .from('event_invites')
        .update({ status: 'declined' })
        .eq('id', inviteId)

      if (declineError) {
        return NextResponse.json({ error: declineError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, venue_id, max_attendees, event_type, credits_required, cancellation_hours')
      .eq('id', invite.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { count: existingBooking } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', invite.event_id)
      .eq('user_id', authData.user.id)
      .in('status', ['confirmed', 'waitlist'])

    const creditsRequired = Math.max(0, Number(event.credits_required ?? 0))

    if ((existingBooking ?? 0) === 0) {
      let venueCreditsApplied = 0
      let creditsToDebit = creditsRequired
      let creditSplit = { purchasedUsed: 0, complimentaryUsed: 0 }

      if (creditsRequired > 0) {
        const now = new Date().toISOString()
        const [{ data: profile, error: profileError }, { data: grantRows }] = await Promise.all([
          supabase
            .from('profiles')
            .select('credits, credits_purchased, credits_complimentary')
            .eq('id', authData.user.id)
            .single(),
          event.venue_id
            ? supabase
                .from('venue_credit_grants')
                .select('venue_id, credits_remaining')
                .eq('user_id', authData.user.id)
                .eq('venue_id', event.venue_id)
                .gt('credits_remaining', 0)
                .or(`expires_at.is.null,expires_at.gt.${now}`)
            : Promise.resolve({ data: [] as { venue_id: string; credits_remaining: number }[] }),
        ])

        if (profileError || !profile) {
          return NextResponse.json({ error: 'User profile not found' }, { status: 404 })
        }

        const grants = (grantRows || []) as { venue_id: string; credits_remaining: number }[]
        if (
          !canAffordWithVenueCredits(
            getSpendableRegularCredits(profile),
            grants,
            event.venue_id,
            creditsRequired,
          )
        ) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
        }

        const { purchased, complimentary } = getEffectiveCreditBalances(profile)
        const regularNeeded = Math.max(
          0,
          creditsRequired - venueCreditsForEvent(grants, event.venue_id),
        )
        if (!hasEnoughCredits(purchased, complimentary, regularNeeded)) {
          return NextResponse.json({ error: 'Insufficient credits' }, { status: 400 })
        }

        const venueApply = await applyVenueCreditGrants(
          supabase,
          authData.user.id,
          event.venue_id,
          creditsRequired,
        )
        venueCreditsApplied = venueApply.venueCreditsApplied
        creditsToDebit = venueApply.creditsToDebit
        creditSplit = splitDeduction(purchased, complimentary, creditsToDebit)
      }

      const { data: booking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: authData.user.id,
          event_id: invite.event_id,
          credits_used: creditsToDebit,
          credits_purchased_used: creditSplit.purchasedUsed,
          credits_complimentary_used: creditSplit.complimentaryUsed,
          credits_venue_used: venueCreditsApplied,
          status: 'confirmed',
          booking_scope: 'performer',
          attendance_status: null,
        })
        .select('id')
        .single()

      if (bookingError || !booking) {
        return NextResponse.json({ error: bookingError?.message || 'Failed to create booking' }, { status: 500 })
      }

      if (creditsRequired > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('credits, credits_purchased, credits_complimentary')
          .eq('id', authData.user.id)
          .single()

        const { purchased: currentPurchased, complimentary: currentComplimentary } =
          getEffectiveCreditBalances(profile ?? {})

        const { error: creditUpdateError } = await supabase
          .from('profiles')
          .update({
            credits: (profile?.credits ?? 0) - creditsToDebit,
            credits_purchased: currentPurchased - creditSplit.purchasedUsed,
            credits_complimentary: currentComplimentary - creditSplit.complimentaryUsed,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authData.user.id)

        if (creditUpdateError) {
          await supabase.from('bookings').delete().eq('id', booking.id)
          return NextResponse.json({ error: creditUpdateError.message }, { status: 500 })
        }

        const transactions: {
          user_id: string
          amount: number
          transaction_type: string
          reference_id: string
          venue_id?: string
          notes: string
        }[] = []

        if (venueCreditsApplied > 0 && event.venue_id) {
          transactions.push({
            user_id: authData.user.id,
            amount: -venueCreditsApplied,
            transaction_type: 'venue_credit_spend',
            venue_id: event.venue_id,
            reference_id: booking.id,
            notes: `Venue credit pass used: ${event.title}`,
          })
        }

        if (creditsToDebit > 0) {
          transactions.push({
            user_id: authData.user.id,
            amount: -creditsToDebit,
            transaction_type: 'booking',
            reference_id: booking.id,
            notes: `Booked show invite accepted: ${event.title}`,
          })
        }

        if (transactions.length > 0) {
          await supabase.from('credit_transactions').insert(transactions)
        }
      }
    }

    const { error: acceptError } = await supabase
      .from('event_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId)

    if (acceptError) {
      return NextResponse.json({ error: acceptError.message }, { status: 500 })
    }

    if (event.event_type === 'booked_show' && event.max_attendees !== null) {
      const { count: confirmedCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', invite.event_id)
        .eq('status', 'confirmed')

      await supabase
        .from('events')
        .update({ max_attendees: confirmedCount ?? 0 })
        .eq('id', invite.event_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error responding to invite:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
