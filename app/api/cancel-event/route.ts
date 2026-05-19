import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { getEventCancelledEmail, sendEmail } from '@/lib/email'
import { buildEventUrl, getSiteUrl } from '@/lib/server/emailUrl'

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

    const { eventId } = await request.json()
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, created_by, status, date')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canCancel =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id)

    if (!canCancel) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (event.status === 'cancelled') {
      return NextResponse.json({ success: true, alreadyCancelled: true })
    }

    const { error: updateEventError } = await supabase
      .from('events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', eventId)

    if (updateEventError) {
      return NextResponse.json({ error: updateEventError.message }, { status: 500 })
    }

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        credits_used,
        credits_purchased_used,
        credits_complimentary_used,
        booking_scope,
        status,
        profiles (
          email,
          full_name,
          credits,
          credits_purchased,
          credits_complimentary,
          audience_free_passes_remaining
        )
      `)
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'waitlist'])

    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const transactions: any[] = []

    for (const booking of bookings || []) {
      const profileData = (booking as any).profiles
      const currentCredits = profileData?.credits || 0
      const currentAudiencePasses = profileData?.audience_free_passes_remaining || 0
      const isAudienceBooking = booking.booking_scope === 'audience'

      if (isAudienceBooking && booking.credits_used === 0) {
        const { error: passRestoreError } = await supabase
          .from('profiles')
          .update({ audience_free_passes_remaining: currentAudiencePasses + 1 })
          .eq('id', booking.user_id)

        if (passRestoreError) {
          return NextResponse.json({ error: passRestoreError.message }, { status: 500 })
        }

        transactions.push({
          user_id: booking.user_id,
          amount: 0,
          transaction_type: 'audience_free_pass_restored',
          reference_id: booking.id,
          notes: `Audience free pass restored for cancelled event: ${event.title}`,
        })
      } else if (booking.credits_used > 0) {
        const purchasedUsed = booking.credits_purchased_used ?? 0
        const complimentaryUsed = booking.credits_complimentary_used ?? 0
        const hasLedgerSplit = purchasedUsed > 0 || complimentaryUsed > 0

        const profilePatch: Record<string, unknown> = {
          credits: currentCredits + booking.credits_used,
        }
        if (hasLedgerSplit) {
          profilePatch.credits_purchased = (profileData?.credits_purchased ?? 0) + purchasedUsed
          profilePatch.credits_complimentary = (profileData?.credits_complimentary ?? 0) + complimentaryUsed
        }

        const { error: creditError } = await supabase
          .from('profiles')
          .update(profilePatch)
          .eq('id', booking.user_id)

        if (creditError) {
          return NextResponse.json({ error: creditError.message }, { status: 500 })
        }

        transactions.push({
          user_id: booking.user_id,
          amount: booking.credits_used,
          transaction_type: isAudienceBooking ? 'audience_deposit_return' : 'refund',
          reference_id: booking.id,
          notes: `Refund for cancelled event: ${event.title}`
        })
      }

      const { error: bookingUpdateError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancellation_date: nowIso })
        .eq('id', booking.id)

      if (bookingUpdateError) {
        return NextResponse.json({ error: bookingUpdateError.message }, { status: 500 })
      }

      await supabase.rpc('create_notification', {
        p_user_id: booking.user_id,
        p_type: 'general',
        p_title: 'Event cancelled',
        p_message: `"${event.title}" was cancelled. A full refund has been issued.`,
        p_related_booking_id: booking.id,
        p_related_event_id: eventId,
      })

      if (profileData?.email) {
        const html = getEventCancelledEmail({
          userName: profileData.full_name || 'there',
          eventTitle: event.title,
          eventDate: formatDateTimeEastern(event.date),
          creditsRefunded: booking.credits_used,
          eventUrl: buildEventUrl(eventId) ?? `${getSiteUrl()}/events/${eventId}`,
        })

        await sendEmail({
          to: profileData.email,
          subject: `Event Cancelled: ${event.title}`,
          html,
        })
      }
    }

    if (transactions.length > 0) {
      await supabase.from('credit_transactions').insert(transactions)
    }

    return NextResponse.json({ success: true, cancelledCount: bookings?.length || 0 })
  } catch (error: any) {
    console.error('Error cancelling event:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
