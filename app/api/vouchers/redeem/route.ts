import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
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

    const { code, orderTotalCents, notes } = await request.json()
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Missing voucher code' }, { status: 400 })
    }

    const { data: voucher, error: voucherError } = await supabase
      .from('booking_vouchers')
      .select('id, event_id, user_id, code, value_cents, status, expires_at')
      .eq('code', code.trim().toUpperCase())
      .single()

    if (voucherError || !voucher) {
      return NextResponse.json({ error: 'Voucher not found' }, { status: 404 })
    }

    if (voucher.status !== 'issued') {
      return NextResponse.json({ error: `Voucher cannot be redeemed (status: ${voucher.status})` }, { status: 400 })
    }

    if (voucher.expires_at && new Date(voucher.expires_at) < new Date()) {
      await supabase
        .from('booking_vouchers')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', voucher.id)
      return NextResponse.json({ error: 'Voucher has expired' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, created_by, host_user_id, venue_id')
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

    const now = new Date().toISOString()
    const { data: updatedVoucher, error: updateError } = await supabase
      .from('booking_vouchers')
      .update({
        status: 'redeemed',
        redeemed_at: now,
        redeemed_by: authData.user.id,
        updated_at: now,
      })
      .eq('id', voucher.id)
      .eq('status', 'issued')
      .select('id, value_cents, status')
      .single()

    if (updateError || !updatedVoucher) {
      return NextResponse.json({ error: updateError?.message || 'Failed to redeem voucher' }, { status: 500 })
    }

    const { error: auditError } = await supabase.from('voucher_redemptions').insert({
      voucher_id: voucher.id,
      event_id: voucher.event_id,
      user_id: voucher.user_id,
      redeemed_by: authData.user.id,
      discount_cents: voucher.value_cents,
      order_total_cents: typeof orderTotalCents === 'number' ? Math.max(0, orderTotalCents) : null,
      notes: typeof notes === 'string' ? notes : null,
    })

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 })
    }

    const { data: attendeeProfile, error: attendeeProfileError } = await supabase
      .from('profiles')
      .select('credits, credits_complimentary')
      .eq('id', voucher.user_id)
      .single()

    if (attendeeProfileError || !attendeeProfile) {
      return NextResponse.json(
        { error: attendeeProfileError?.message || 'Failed to load attendee profile for credit return' },
        { status: 500 }
      )
    }

    const redeemedCredits = Math.max(0, Math.ceil(Number(voucher.value_cents || 0) / 100))
    if (redeemedCredits > 0) {
      const { error: creditUpdateError } = await supabase
        .from('profiles')
        .update({
          credits: Number(attendeeProfile.credits || 0) + redeemedCredits,
          credits_complimentary: (attendeeProfile.credits_complimentary ?? 0) + redeemedCredits,
          updated_at: new Date().toISOString(),
        })
        .eq('id', voucher.user_id)

      if (creditUpdateError) {
        return NextResponse.json({ error: creditUpdateError.message }, { status: 500 })
      }

      const { error: txError } = await supabase
        .from('credit_transactions')
        .insert({
          user_id: voucher.user_id,
          amount: redeemedCredits,
          transaction_type: 'food_coupon_redeemed_credit',
          reference_id: voucher.id,
          notes: `Food coupon redeemed for event ${voucher.event_id}`,
          created_by: authData.user.id,
        })

      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      voucherId: updatedVoucher.id,
      discountCents: updatedVoucher.value_cents,
      redeemedCredits,
      status: updatedVoucher.status,
    })
  } catch (error: unknown) {
    console.error('Error redeeming voucher:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

