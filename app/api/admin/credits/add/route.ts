import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

type ProfileRoleRow = { id: string; role?: string } | null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveAdminUser(supabase: any, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()
  const profile = data as ProfileRoleRow
  if (profile?.role === 'admin') return true

  const { data: adminFallback } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!adminFallback
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

    const isAdmin = await resolveAdminUser(supabase, authData.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const userId = typeof body?.userId === 'string' ? body.userId : ''
    const amount = Math.floor(Number(body?.amount || 0))
    const creditSource = body?.creditSource === 'in_kind' ? 'in_kind' : 'cash'
    const sourceReasonRaw = typeof body?.sourceReason === 'string' ? body.sourceReason.trim() : ''
    const notesRaw = typeof body?.notes === 'string' ? body.notes.trim() : ''

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
    }
    if (creditSource === 'in_kind' && sourceReasonRaw.length === 0) {
      return NextResponse.json({ error: 'Reason is required for in-kind credits' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, credits, credits_purchased, credits_complimentary')
      .eq('id', userId)
      .single()
    if (profileError || !profile) {
      return NextResponse.json({ error: profileError?.message || 'User not found' }, { status: 404 })
    }

    const nextCredits = Number(profile.credits || 0) + amount
    const nextComplimentary = (profile.credits_complimentary ?? 0) + amount
    const nowIso = new Date().toISOString()

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ credits: nextCredits, credits_complimentary: nextComplimentary, updated_at: nowIso })
      .eq('id', userId)
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    const noteSegments = [notesRaw, creditSource === 'cash' ? 'Cash payment' : 'In-kind credit']
      .map((item) => item.trim())
      .filter(Boolean)
    const finalNotes = noteSegments.join(' | ')

    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount,
      transaction_type: 'manual_add',
      notes: finalNotes || null,
      created_by: authData.user.id,
      credit_source: creditSource,
      source_reason: sourceReasonRaw || null,
    })
    if (txError) return NextResponse.json({ error: txError.message }, { status: 500 })

    return NextResponse.json({ success: true, newBalance: nextCredits })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
