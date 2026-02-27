import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
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

    const url = new URL(request.url)
    const code = (url.searchParams.get('code') || '').trim().toUpperCase()
    const eventId = (url.searchParams.get('eventId') || '').trim()
    if (!code) {
      return NextResponse.json({ error: 'Missing coupon code' }, { status: 400 })
    }

    const { data: voucher, error: voucherError } = await supabase
      .from('booking_vouchers')
      .select('id, event_id, user_id, code, value_cents, status, expires_at, venue_id')
      .eq('code', code)
      .single()

    if (voucherError || !voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    if (eventId && voucher.event_id !== eventId) {
      return NextResponse.json({ error: 'Coupon does not belong to this event' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, created_by, host_user_id, venue_id')
      .eq('id', voucher.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle()

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    const isAdmin = profile?.role === 'admin' || !!adminRow
    const isEventManager = event.created_by === authData.user.id || event.host_user_id === authData.user.id
    const { data: venueStaffRow } = await supabase
      .from('venue_staff')
      .select('id')
      .eq('user_id', authData.user.id)
      .eq('venue_id', event.venue_id)
      .eq('active', true)
      .maybeSingle()

    const isVenueStaff = !!venueStaffRow
    if (!isAdmin && !isEventManager && !isVenueStaff) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: attendeeProfile } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', voucher.user_id)
      .maybeSingle()

    const isExpired = !!voucher.expires_at && new Date(voucher.expires_at) < new Date()
    const canRedeem = voucher.status === 'issued' && !isExpired

    return NextResponse.json({
      voucher: {
        id: voucher.id,
        code: voucher.code,
        eventId: voucher.event_id,
        eventTitle: event.title,
        eventDate: event.date,
        userId: voucher.user_id,
        attendeeName: attendeeProfile?.full_name || attendeeProfile?.email || 'Attendee',
        attendeeEmail: attendeeProfile?.email || null,
        valueCents: Number(voucher.value_cents || 0),
        status: isExpired && voucher.status === 'issued' ? 'expired' : voucher.status,
        expiresAt: voucher.expires_at,
        canRedeem,
      },
    })
  } catch (error: unknown) {
    console.error('Error looking up voucher:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

