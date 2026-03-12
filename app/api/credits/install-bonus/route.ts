import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const INSTALL_BONUS_CREDITS = 5

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, credits, credits_complimentary, install_bonus_granted_at')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Install bonus is audience-only.
    if ((profile as { role?: string }).role !== 'audience') {
      return NextResponse.json({ success: true, alreadyGranted: true, audienceOnly: true, credits: profile.credits })
    }

    if ((profile as { install_bonus_granted_at?: string | null }).install_bonus_granted_at) {
      return NextResponse.json({ success: true, alreadyGranted: true, credits: profile.credits })
    }

    const nextCredits = Number(profile.credits || 0) + INSTALL_BONUS_CREDITS
    const nextComplimentary = (profile.credits_complimentary ?? 0) + INSTALL_BONUS_CREDITS
    const nowIso = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        credits: nextCredits,
        credits_complimentary: nextComplimentary,
        install_bonus_granted_at: nowIso,
        updated_at: nowIso,
      })
      .eq('id', authData.user.id)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: authData.user.id,
      amount: INSTALL_BONUS_CREDITS,
      transaction_type: 'manual_add',
      notes: 'Install app bonus',
      credit_source: 'install_bonus',
      source_reason: null,
      created_by: authData.user.id,
    })

    if (txError) {
      console.error('Install bonus credit_transaction insert failed:', txError)
      // Don't fail the request - credits were already added to profile
    }

    return NextResponse.json({ success: true, credits: nextCredits })
  } catch (error: unknown) {
    console.error('Install bonus error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
