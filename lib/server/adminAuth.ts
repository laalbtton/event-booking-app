import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export async function isAdminUserId(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((data as { role?: string } | null)?.role === 'admin') return true
  const { data: adminFallback } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!adminFallback
}

type AdminAuthOk = { ok: true; supabase: SupabaseClient; userId: string }
type AdminAuthFail = { ok: false; response: NextResponse }

/**
 * Resolve the calling admin from a Bearer session token.
 * Returns a ready-to-return NextResponse on failure so routes stay short.
 */
export async function requireAdmin(request: Request): Promise<AdminAuthOk | AdminAuthFail> {
  const supabase = getAdminClient()
  if (!supabase) {
    return { ok: false, response: NextResponse.json({ error: 'Server configuration error' }, { status: 500 }) }
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return { ok: false, response: NextResponse.json({ error: 'Missing auth token' }, { status: 401 }) }
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!(await isAdminUserId(supabase, data.user.id))) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, supabase, userId: data.user.id }
}
