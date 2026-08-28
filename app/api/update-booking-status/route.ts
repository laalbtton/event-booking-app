import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { promptPerformerAboutOpenRoles } from '@/lib/server/performerRoleNotify'

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

    const { bookingId, status } = await request.json()
    if (!bookingId || (status !== 'confirmed' && status !== 'waitlist')) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
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
      .select('id, event_id, user_id, status, waitlist_position, booking_scope, event_art_type_id')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, max_attendees, audience_capacity, created_by, host_user_id, event_type, open_mic_type, variety_use_max_attendees')
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

    const bookingScope = booking.booking_scope === 'audience' ? 'audience' : 'performer'
    const isVarietyPerformer =
      bookingScope === 'performer' &&
      event.event_type === 'open_mic' &&
      (event as any).open_mic_type === 'variety_arts_open_mic'
    const useGlobalVarietyCapacity = isVarietyPerformer && !!(event as any).variety_use_max_attendees

    if (status === 'confirmed' && event.event_type !== 'booked_show') {
      let capacity: number | null =
        bookingScope === 'audience'
          ? Math.max(0, Number((event as any).audience_capacity || 0))
          : event.max_attendees

      let countQuery = supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', booking.event_id)
        .eq('status', 'confirmed')
        .eq('booking_scope', bookingScope)

      if (isVarietyPerformer && booking.event_art_type_id && !useGlobalVarietyCapacity) {
        const { data: artTypeRow, error: artTypeError } = await supabase
          .from('event_art_types')
          .select('slot_capacity')
          .eq('id', booking.event_art_type_id)
          .eq('event_id', booking.event_id)
          .maybeSingle()
        if (artTypeError || !artTypeRow) {
          return NextResponse.json({ error: 'Invalid art type bucket for this booking' }, { status: 400 })
        }
        capacity = Number(artTypeRow.slot_capacity || 0)
        countQuery = countQuery.eq('event_art_type_id', booking.event_art_type_id)
      } else if (!isVarietyPerformer) {
        countQuery = countQuery.is('event_art_type_id', null)
      }

      const { count, error: countError } = await countQuery

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
      }

      const confirmedCount = count ?? 0
      if (capacity !== null && confirmedCount >= capacity) {
        if (bookingScope === 'performer' && !isVarietyPerformer && event.max_attendees !== null) {
          await supabase
            .from('events')
            .update({ max_attendees: confirmedCount + 1 })
            .eq('id', booking.event_id)
        } else {
          return NextResponse.json({ error: 'No capacity available for the selected booking bucket' }, { status: 400 })
        }
      }
    }

    const updatePayload: Record<string, any> = {
      status,
      waitlist_position: null,
    }
    if (status === 'waitlist') {
      updatePayload.attendance_status = null
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', booking.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.rpc('update_waitlist_positions_scoped', {
      event_uuid: booking.event_id,
      booking_scope_filter: bookingScope,
      event_art_type_uuid: isVarietyPerformer && !useGlobalVarietyCapacity ? booking.event_art_type_id : null,
      include_all_art_types: useGlobalVarietyCapacity,
    })

    if (event.event_type === 'booked_show') {
      const { count: confirmedCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', booking.event_id)
        .eq('status', 'confirmed')
        .eq('booking_scope', 'performer')

      if (event.max_attendees !== null) {
        await supabase
          .from('events')
          .update({ max_attendees: confirmedCount ?? 0 })
          .eq('id', booking.event_id)
      }
    }

    if (
      status === 'confirmed' &&
      booking.status !== 'confirmed' &&
      bookingScope === 'performer' &&
      booking.user_id
    ) {
      await promptPerformerAboutOpenRoles(supabase, booking.event_id, booking.user_id)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating booking status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
