import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

/** Count issued coupons created after the user last viewed the Coupons tab. */
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

    const userId = authData.user.id

    const { data: tabState } = await supabase
      .from('user_coupon_tab_state')
      .select('last_viewed_at')
      .eq('user_id', userId)
      .maybeSingle()

    const lastViewedAt = tabState?.last_viewed_at || null

    let query = supabase
      .from('booking_vouchers')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'issued')

    if (lastViewedAt) {
      query = query.gt('created_at', lastViewedAt)
    }

    const { count, error } = await query
    if (error) {
      // Table may not exist yet before migration — fail soft
      if (error.code === '42P01' || error.message?.includes('user_coupon_tab_state')) {
        return NextResponse.json({ count: 0 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ count: count ?? 0 })
  } catch (error: unknown) {
    console.error('Error loading coupon unread count:', error)
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
