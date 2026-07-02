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

    const { data: vouchers, error: vouchersError } = await supabase
      .from('booking_vouchers')
      .select('id, event_id, code, value_cents, voucher_type, status, expires_at, created_at')
      .eq('user_id', authData.user.id)
      .order('created_at', { ascending: false })

    if (vouchersError) {
      return NextResponse.json({ error: vouchersError.message }, { status: 500 })
    }

    const eventIds = Array.from(new Set((vouchers || []).map((v) => v.event_id).filter(Boolean)))
    const eventMap = new Map<string, { title: string; date: string }>()

    if (eventIds.length > 0) {
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, title, date')
        .in('id', eventIds)

      if (!eventsError && events) {
        for (const event of events) {
          eventMap.set(event.id, { title: event.title, date: event.date })
        }
      }
    }

    const payload = (vouchers || []).map((voucher) => {
      const voucherType: string = (voucher as any).voucher_type ?? 'food_coupon'
      const isLuckyDraw = voucherType === 'lucky_draw'
      const eventInfo = voucher.event_id ? eventMap.get(voucher.event_id) : null
      return {
        id: voucher.id,
        eventId: voucher.event_id ?? null,
        eventTitle: isLuckyDraw ? "Free Chai at Ryan's Chai" : (eventInfo?.title ?? 'Event'),
        eventDate: eventInfo?.date ?? null,
        code: voucher.code,
        valueCents: voucher.value_cents,
        voucherType,
        status: voucher.status,
        expiresAt: voucher.expires_at,
        createdAt: voucher.created_at,
      }
    })

    return NextResponse.json({ vouchers: payload })
  } catch (error: any) {
    console.error('Error loading my vouchers:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

