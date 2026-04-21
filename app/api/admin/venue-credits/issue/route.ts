import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return (data as { role?: string } | null)?.role === 'admin'
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

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : ''
    const venueId = typeof body?.venueId === 'string' ? body.venueId.trim() : ''
    const credits = Math.floor(Number(body?.credits || 0))
    const notes = typeof body?.notes === 'string' ? body.notes.trim() : null
    const expiresAt = typeof body?.expiresAt === 'string' && body.expiresAt ? body.expiresAt : null

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
    if (!venueId) return NextResponse.json({ error: 'Missing venueId' }, { status: 400 })
    if (!Number.isFinite(credits) || credits <= 0) {
      return NextResponse.json({ error: 'credits must be a positive integer' }, { status: 400 })
    }

    // Verify user and venue exist
    const [{ data: targetUser }, { data: venue }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, email').eq('id', userId).maybeSingle(),
      supabase.from('venues').select('id, name').eq('id', venueId).maybeSingle(),
    ])
    if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

    const nowIso = new Date().toISOString()

    // Insert the grant
    const { data: grant, error: grantError } = await supabase
      .from('venue_credit_grants')
      .insert({
        user_id: userId,
        venue_id: venueId,
        credits_total: credits,
        credits_remaining: credits,
        notes: notes || null,
        issued_by: authData.user.id,
        issued_at: nowIso,
        expires_at: expiresAt,
      })
      .select('id')
      .single()

    if (grantError || !grant) {
      return NextResponse.json({ error: grantError?.message || 'Failed to create grant' }, { status: 500 })
    }

    // Log to credit_transactions for reporting (does NOT touch profiles.credits)
    const { error: txError } = await supabase.from('credit_transactions').insert({
      user_id: userId,
      amount: credits,
      transaction_type: 'venue_credit_grant',
      venue_id: venueId,
      reference_id: grant.id,
      notes: notes
        ? `Venue credit pass issued (${(venue as { name: string }).name}): ${notes}`
        : `Venue credit pass issued (${(venue as { name: string }).name})`,
      created_by: authData.user.id,
    })

    if (txError) {
      // Non-fatal: grant already created, just log the issue
      console.error('Failed to log venue_credit_grant transaction:', txError)
    }

    return NextResponse.json({ success: true, grantId: grant.id })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
