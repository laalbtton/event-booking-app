import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { splitDeduction, hasEnoughCredits } from '@/lib/creditLedger'
import {
  CHAI_PROMO_CREDITS,
  CHAI_PROMO_TITLE,
  CHAI_PROMO_VALIDITY_DAYS,
  CHAI_PROMO_VALUE_CENTS,
  CHAI_PROMO_VOUCHER_TYPE,
} from '@/lib/chaiPromo'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

function buildChaiCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let token = ''
  for (let i = 0; i < 6; i += 1) {
    token += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return `CHAI-${token}`
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

    const userId = authData.user.id

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, credits, credits_purchased, credits_complimentary, role')
      .eq('id', userId)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Audience-focused promo; admins can still purchase for testing
    if (profile.role !== 'audience' && profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'This promotion is available to audience members' },
        { status: 403 }
      )
    }

    const purchased = profile.credits_purchased ?? 0
    const complimentary = profile.credits_complimentary ?? 0
    if (!hasEnoughCredits(purchased, complimentary, CHAI_PROMO_CREDITS)) {
      return NextResponse.json(
        { error: `You need ${CHAI_PROMO_CREDITS} credits to buy this coupon` },
        { status: 400 }
      )
    }

    const { data: venue } = await supabase
      .from('venues')
      .select('id, name')
      .ilike('name', '%ryan%chai%')
      .limit(1)
      .maybeSingle()

    if (!venue?.id) {
      return NextResponse.json(
        { error: "Ryan's Chai venue is not configured yet. Please contact support." },
        { status: 500 }
      )
    }

    const split = splitDeduction(purchased, complimentary, CHAI_PROMO_CREDITS)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CHAI_PROMO_VALIDITY_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { error: creditError } = await supabase
      .from('profiles')
      .update({
        credits: Math.max(0, Number(profile.credits || 0) - CHAI_PROMO_CREDITS),
        credits_purchased: Math.max(0, purchased - split.purchasedUsed),
        credits_complimentary: Math.max(0, complimentary - split.complimentaryUsed),
        updated_at: now.toISOString(),
      })
      .eq('id', userId)

    if (creditError) {
      return NextResponse.json({ error: creditError.message }, { status: 500 })
    }

    let voucher: { id: string; code: string; expires_at: string } | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = buildChaiCode()
      const { data: created, error: voucherError } = await supabase
        .from('booking_vouchers')
        .insert({
          booking_id: null,
          event_id: null,
          user_id: userId,
          venue_id: venue.id,
          code,
          value_cents: CHAI_PROMO_VALUE_CENTS,
          voucher_type: CHAI_PROMO_VOUCHER_TYPE,
          status: 'issued',
          expires_at: expiresAt,
          metadata: {
            promotion: 'ryans-chai-1-dollar',
            description: CHAI_PROMO_TITLE,
            credits_paid: CHAI_PROMO_CREDITS,
          },
        })
        .select('id, code, expires_at')
        .single()

      if (!voucherError && created) {
        voucher = created
        break
      }
      if (!voucherError?.message?.toLowerCase().includes('duplicate')) {
        // Roll back credits on unexpected failure
        await supabase
          .from('profiles')
          .update({
            credits: profile.credits,
            credits_purchased: purchased,
            credits_complimentary: complimentary,
            updated_at: now.toISOString(),
          })
          .eq('id', userId)
        return NextResponse.json({ error: voucherError?.message || 'Failed to issue coupon' }, { status: 500 })
      }
    }

    if (!voucher) {
      await supabase
        .from('profiles')
        .update({
          credits: profile.credits,
          credits_purchased: purchased,
          credits_complimentary: complimentary,
          updated_at: now.toISOString(),
        })
        .eq('id', userId)
      return NextResponse.json({ error: 'Failed to issue coupon code' }, { status: 500 })
    }

    await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: -CHAI_PROMO_CREDITS,
      transaction_type: 'promo_chai_purchase',
      reference_id: voucher.id,
      notes: `${CHAI_PROMO_TITLE} — ${CHAI_PROMO_CREDITS} credits`,
    })

    return NextResponse.json({
      success: true,
      voucherId: voucher.id,
      code: voucher.code,
      expiresAt: voucher.expires_at,
      creditsCharged: CHAI_PROMO_CREDITS,
      title: CHAI_PROMO_TITLE,
    })
  } catch (error: unknown) {
    console.error('Error purchasing chai promo coupon:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
