import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { userCanManageEventChatSettings } from '@/lib/eventChatPermissions'
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

/** Logged-in user from a Bearer session token. Does not check a role. */
export async function requireSession(request: Request): Promise<AdminAuthOk | AdminAuthFail> {
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

  return { ok: true, supabase, userId: data.user.id }
}

/**
 * Resolve the calling admin from a Bearer session token.
 * Returns a ready-to-return NextResponse on failure so routes stay short.
 */
export async function requireAdmin(request: Request): Promise<AdminAuthOk | AdminAuthFail> {
  const session = await requireSession(request)
  if (!session.ok) return session
  if (!(await isAdminUserId(session.supabase, session.userId))) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return session
}

/**
 * Who may import a sign-up sheet: platform admins, or anyone who can open
 * Manage Attendees for the event (host, creator, community admin/co-admin).
 * eventId is required for non-admins.
 */
export async function requireAudienceImporter(
  request: Request,
  eventId: string | null,
): Promise<AdminAuthOk | AdminAuthFail> {
  const session = await requireSession(request)
  if (!session.ok) return session

  if (await isAdminUserId(session.supabase, session.userId)) return session
  if (!eventId) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const { data: event } = await session.supabase
    .from('events')
    .select('host_user_id, created_by')
    .eq('id', eventId)
    .maybeSingle()
  if (!event) {
    return { ok: false, response: NextResponse.json({ error: 'Event not found' }, { status: 404 }) }
  }

  const allowed = await userCanManageEventChatSettings(session.supabase, eventId, session.userId, {
    host_user_id: event.host_user_id as string | null,
    created_by: event.created_by as string | null,
  })
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return session
}
