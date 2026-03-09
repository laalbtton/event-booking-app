import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const inviteToken = typeof body?.inviteToken === 'string' ? body.inviteToken.trim() : ''
    if (!inviteToken) return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })

    const { data: link, error: linkError } = await supabase
      .from('app_invite_links')
      .select('id, token, welcome_credits, expires_at, max_uses, uses, is_active')
      .eq('token', inviteToken)
      .maybeSingle()
    if (linkError || !link) return NextResponse.json({ error: 'Invite link is invalid' }, { status: 404 })
    if (!link.is_active) return NextResponse.json({ error: 'Invite link is inactive' }, { status: 400 })
    if (new Date(link.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invite link has expired' }, { status: 400 })
    }
    if (link.max_uses !== null && Number(link.uses || 0) >= Number(link.max_uses || 0)) {
      return NextResponse.json({ error: 'Invite link has reached max uses' }, { status: 400 })
    }

    const grantInsert = await supabase
      .from('app_invite_credit_grants')
      .insert({
        invite_link_id: link.id,
        user_id: authData.user.id,
        credits_granted: link.welcome_credits,
      })
      .select('id')
      .maybeSingle()

    if (grantInsert.error) {
      const isDuplicate = grantInsert.error.message?.toLowerCase().includes('duplicate')
      if (isDuplicate) {
        return NextResponse.json({ success: true, granted: false, alreadyGranted: true, creditsGranted: 0 })
      }
      return NextResponse.json({ error: grantInsert.error.message }, { status: 500 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', authData.user.id)
      .single()
    if (profileError || !profile) {
      return NextResponse.json({ error: profileError?.message || 'Profile not found' }, { status: 500 })
    }

    const creditsGranted = Number(link.welcome_credits || 0)
    const nextCredits = Number(profile.credits || 0) + creditsGranted
    const nowIso = new Date().toISOString()

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({ credits: nextCredits, updated_at: nowIso })
      .eq('id', authData.user.id)
    if (profileUpdateError) {
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 })
    }

    await supabase.from('credit_transactions').insert({
      user_id: authData.user.id,
      amount: creditsGranted,
      transaction_type: 'welcome_invite_credit',
      reference_id: link.id,
      notes: `Welcome credits granted via invite link ${link.token}`,
      credit_source: 'in_kind',
      source_reason: 'welcome_invite',
    })

    const { count: grantCount } = await supabase
      .from('app_invite_credit_grants')
      .select('id', { count: 'exact', head: true })
      .eq('invite_link_id', link.id)

    await supabase
      .from('app_invite_links')
      .update({ uses: Number(grantCount || 0) })
      .eq('id', link.id)

    return NextResponse.json({
      success: true,
      granted: true,
      alreadyGranted: false,
      creditsGranted,
      newBalance: nextCredits,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
