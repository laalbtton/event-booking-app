import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
      .select('id, event_id, status, waitlist_position')
      .eq('id', bookingId)
      .single()

    if (bookingError || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, max_attendees, created_by, host_user_id')
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

    if (status === 'confirmed' && event.max_attendees !== null) {
      const { count, error: countError } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', booking.event_id)
        .eq('status', 'confirmed')

      if (countError) {
        return NextResponse.json({ error: countError.message }, { status: 500 })
      }

      const confirmedCount = count ?? 0
      if (confirmedCount >= event.max_attendees) {
        await supabase
          .from('events')
          .update({ max_attendees: confirmedCount + 1 })
          .eq('id', booking.event_id)
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

    await supabase.rpc('update_waitlist_positions', { event_uuid: booking.event_id })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error updating booking status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
