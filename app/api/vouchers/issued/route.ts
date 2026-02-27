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
    const venueId = (url.searchParams.get('venueId') || '').trim()
    const eventId = (url.searchParams.get('eventId') || '').trim()
    const query = (url.searchParams.get('q') || '').trim().toLowerCase()
    if (!venueId) {
      return NextResponse.json({ error: 'Missing venueId' }, { status: 400 })
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
    let canAccess = isAdmin
    if (!canAccess) {
      const { data: venueStaffRow } = await supabase
        .from('venue_staff')
        .select('id')
        .eq('user_id', authData.user.id)
        .eq('venue_id', venueId)
        .eq('active', true)
        .maybeSingle()
      canAccess = !!venueStaffRow
    }

    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let vouchersQuery = supabase
      .from('booking_vouchers')
      .select('id, event_id, user_id, code, value_cents, status, expires_at, redeemed_at, created_at')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })
      .limit(500)

    if (eventId && eventId !== 'all') {
      vouchersQuery = vouchersQuery.eq('event_id', eventId)
    }

    const { data: vouchers, error: vouchersError } = await vouchersQuery
    if (vouchersError) {
      return NextResponse.json({ error: vouchersError.message }, { status: 500 })
    }

    const voucherRows = vouchers || []
    if (voucherRows.length === 0) {
      return NextResponse.json({ vouchers: [] })
    }

    const eventIds = Array.from(new Set(voucherRows.map((row) => row.event_id)))
    const userIds = Array.from(new Set(voucherRows.map((row) => row.user_id)))

    const [{ data: events }, { data: users }] = await Promise.all([
      supabase.from('events').select('id, title, date').in('id', eventIds),
      supabase.from('profiles').select('id, full_name, email').in('id', userIds),
    ])

    const eventMap = new Map(
      (events || []).map((row) => [String((row as { id: string }).id), row as { id: string; title: string; date: string }])
    )
    const userMap = new Map(
      (users || []).map((row) => [String((row as { id: string }).id), row as { id: string; full_name: string | null; email: string | null }])
    )

    const mapped = voucherRows.map((voucher) => {
      const event = eventMap.get(voucher.event_id)
      const user = userMap.get(voucher.user_id)
      const attendeeName = user?.full_name || user?.email || 'Attendee'
      return {
        id: voucher.id,
        eventId: voucher.event_id,
        eventTitle: event?.title || 'Event',
        eventDate: event?.date || null,
        userId: voucher.user_id,
        attendeeName,
        attendeeEmail: user?.email || null,
        code: voucher.code,
        valueCents: Number(voucher.value_cents || 0),
        status: voucher.status,
        expiresAt: voucher.expires_at,
        redeemedAt: voucher.redeemed_at,
        createdAt: voucher.created_at,
      }
    })

    const filtered = query
      ? mapped.filter((row) =>
          row.attendeeName.toLowerCase().includes(query) ||
          (row.attendeeEmail || '').toLowerCase().includes(query) ||
          row.code.toLowerCase().includes(query)
        )
      : mapped

    return NextResponse.json({ vouchers: filtered })
  } catch (error: unknown) {
    console.error('Error loading issued vouchers:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

