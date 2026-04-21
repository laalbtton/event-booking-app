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

/**
 * GET /api/admin/venue-credits
 * Query params:
 *   venueId  – filter by venue  (optional)
 *   userId   – filter by user   (optional)
 *   active   – "true" to only return grants with credits_remaining > 0 and not expired
 */
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

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venueId') || null
    const userId = searchParams.get('userId') || null
    const activeOnly = searchParams.get('active') === 'true'

    let query = supabase
      .from('venue_credit_grants')
      .select(
        `id, user_id, venue_id, credits_total, credits_remaining, notes, issued_by, issued_at, expires_at,
         profiles!venue_credit_grants_user_id_fkey(display_name, email, avatar_url),
         venues!venue_credit_grants_venue_id_fkey(name)`
      )
      .order('issued_at', { ascending: false })
      .limit(200)

    if (venueId) query = query.eq('venue_id', venueId)
    if (userId) query = query.eq('user_id', userId)
    if (activeOnly) {
      query = query.gt('credits_remaining', 0)
      // Can't filter by expires_at IS NULL OR > now() easily in a single chain,
      // so we post-filter below.
    }

    const { data: grants, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const now = new Date()
    const filtered = activeOnly
      ? (grants || []).filter((g: any) => !g.expires_at || new Date(g.expires_at) > now)
      : (grants || [])

    return NextResponse.json({ grants: filtered })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
