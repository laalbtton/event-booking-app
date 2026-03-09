import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

function buildInviteToken() {
  return `WL-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`
}

type AppInviteLinkRow = {
  id: string
  token: string
  welcome_credits: number
  expires_at: string
  max_uses: number | null
  uses: number
  is_active: boolean
  created_at: string
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

export async function GET(request: NextRequest) {
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

    const { data, error } = await supabase
      .from('app_invite_links')
      .select('id, token, welcome_credits, expires_at, max_uses, uses, is_active, created_at')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ links: data || [] })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
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
    const welcomeCredits = Math.floor(Number(body?.welcomeCredits || 0))
    const maxUsesValue = body?.maxUses === null || body?.maxUses === '' ? null : Math.floor(Number(body?.maxUses))
    const expiresAtRaw = typeof body?.expiresAt === 'string' ? body.expiresAt : ''
    const expiresAt = new Date(expiresAtRaw)

    if (!Number.isFinite(welcomeCredits) || welcomeCredits <= 0) {
      return NextResponse.json({ error: 'Welcome credits must be greater than 0' }, { status: 400 })
    }
    if (maxUsesValue !== null && (!Number.isFinite(maxUsesValue) || maxUsesValue <= 0)) {
      return NextResponse.json({ error: 'Max uses must be empty or greater than 0' }, { status: 400 })
    }
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return NextResponse.json({ error: 'Expiry must be a valid future date/time' }, { status: 400 })
    }

    let created: AppInviteLinkRow | null = null
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const tokenValue = buildInviteToken()
      const { data, error } = await supabase
        .from('app_invite_links')
        .insert({
          token: tokenValue,
          welcome_credits: welcomeCredits,
          expires_at: expiresAt.toISOString(),
          max_uses: maxUsesValue,
          created_by: authData.user.id,
          is_active: true,
        })
        .select('id, token, welcome_credits, expires_at, max_uses, uses, is_active, created_at')
        .single()

      if (!error && data) {
        created = data
        break
      }
      if (!error?.message?.toLowerCase().includes('duplicate')) {
        return NextResponse.json({ error: error?.message || 'Failed to create invite link' }, { status: 500 })
      }
    }

    if (!created) {
      return NextResponse.json({ error: 'Failed to generate unique invite token' }, { status: 500 })
    }

    const origin = new URL(request.url).origin
    return NextResponse.json({
      link: created,
      shareUrl: `${origin}/welcome/${created.token}`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
