import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { releasePerformerRolesForUser } from '@/lib/server/releasePerformerRoles'

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

    const { bookingId } = await request.json()
    if (!bookingId) {
      return NextResponse.json({ error: 'Missing bookingId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('id, event_id, user_id, credits_used, credits_purchased_used, credits_complimentary_used, status, booking_scope, event_art_type_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, date, cancellation_hours, event_type, open_mic_type, variety_use_max_attendees, max_attendees, audience_capacity, created_by, host_user_id')
      .eq('id', booking.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canUpdate =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id

    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const now = new Date()
    const eventDate = new Date(event.date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const cancellationWindow = event.cancellation_hours || 4
    const refundAllowed = booking.status === 'waitlist' || hoursUntilEvent >= cancellationWindow
    const isAudienceBooking = booking.booking_scope === 'audience'

    let updateError: any = null
    const withDateUpdate = await supabase
      .from('bookings')
      .update({ status: 'cancelled', cancellation_date: now.toISOString() })
      .eq('id', booking.id)

    if (withDateUpdate.error) {
      if (
        withDateUpdate.error.code === '42703' ||
        withDateUpdate.error.message?.includes('cancellation_date')
      ) {
        const fallbackUpdate = await supabase
          .from('bookings')
          .update({ status: 'cancelled' })
          .eq('id', booking.id)
        updateError = fallbackUpdate.error || null
      } else {
        updateError = withDateUpdate.error
      }
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // They are no longer performing, so any optional role they took has to reopen.
    await releasePerformerRolesForUser(supabase, booking.event_id, booking.user_id)

    const purchasedUsed = booking.credits_purchased_used ?? 0
    const complimentaryUsed = booking.credits_complimentary_used ?? 0
    const hasLedgerSplit = purchasedUsed > 0 || complimentaryUsed > 0

    if (refundAllowed && (booking.credits_used > 0 || isAudienceBooking)) {
      const { data: attendeeProfile, error: attendeeError } = await supabase
        .from('profiles')
        .select('credits, credits_purchased, credits_complimentary, audience_free_passes_remaining')
        .eq('id', booking.user_id)
        .single()

      if (attendeeError) {
        return NextResponse.json({ error: attendeeError.message }, { status: 500 })
      }

      const patch: Record<string, any> = {}
      if (booking.credits_used > 0) {
        patch.credits = (attendeeProfile?.credits || 0) + booking.credits_used
        if (hasLedgerSplit) {
          patch.credits_purchased = (attendeeProfile?.credits_purchased ?? 0) + purchasedUsed
          patch.credits_complimentary = (attendeeProfile?.credits_complimentary ?? 0) + complimentaryUsed
        }
      } else if (isAudienceBooking) {
        patch.audience_free_passes_remaining = (attendeeProfile?.audience_free_passes_remaining || 0) + 1
      }

      const { error: creditError } = await supabase
        .from('profiles')
        .update(patch)
        .eq('id', booking.user_id)

      if (creditError) {
        return NextResponse.json({ error: creditError.message }, { status: 500 })
      }

      await supabase.from('credit_transactions').insert({
        user_id: booking.user_id,
        amount: booking.credits_used > 0 ? booking.credits_used : 0,
        transaction_type:
          booking.credits_used > 0
            ? (isAudienceBooking ? 'audience_deposit_return' : 'refund')
            : 'audience_free_pass_restored',
        reference_id: booking.id,
        notes: `Refund for removed attendee: ${event.id}`,
        created_by: authData.user.id,
      })
    }

    const bookingScopeFilter = booking.booking_scope === 'audience' ? 'audience' : 'performer'
    let scopedCapacity: number | null =
      booking.booking_scope === 'audience'
        ? Math.max(0, Number((event as any).audience_capacity || 0))
        : event.max_attendees

    const isVarietyPerformer =
      booking.booking_scope !== 'audience' &&
      event.event_type === 'open_mic' &&
      (event as any).open_mic_type === 'variety_arts_open_mic'
    const useGlobalVarietyCapacity = isVarietyPerformer && !!(event as any).variety_use_max_attendees

    if (isVarietyPerformer && booking.event_art_type_id && !useGlobalVarietyCapacity) {
      const { data: artTypeRow } = await supabase
        .from('event_art_types')
        .select('slot_capacity')
        .eq('id', booking.event_art_type_id)
        .eq('event_id', booking.event_id)
        .maybeSingle()
      scopedCapacity = Number(artTypeRow?.slot_capacity || 0)
    }

    if (booking.status === 'confirmed') {
      await supabase.rpc('promote_waitlist_and_update_positions_scoped', {
        event_uuid: booking.event_id,
        booking_scope_filter: bookingScopeFilter,
        event_art_type_uuid: isVarietyPerformer && !useGlobalVarietyCapacity ? booking.event_art_type_id : null,
        capacity_limit: scopedCapacity,
        include_all_art_types: useGlobalVarietyCapacity,
      })
    } else if (booking.status === 'waitlist') {
      await supabase.rpc('update_waitlist_positions_scoped', {
        event_uuid: booking.event_id,
        booking_scope_filter: bookingScopeFilter,
        event_art_type_uuid: isVarietyPerformer && !useGlobalVarietyCapacity ? booking.event_art_type_id : null,
        include_all_art_types: useGlobalVarietyCapacity,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error removing attendee:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
