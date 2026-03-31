import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { sendPushToAllUsers } from '@/lib/server/push'

async function isSuperAdmin(supabase: SupabaseClient, userId: string) {
  const [{ data: profile }, { data: adminRow }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return (profile as { role?: string } | null)?.role === 'admin' || !!adminRow
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

    if (!(await isSuperAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Super admin only' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const bodyText = typeof body?.body === 'string' ? body.body.trim() : ''
    const urlRaw = typeof body?.url === 'string' ? body.url.trim() : ''

    if (!title || title.length > 120) {
      return NextResponse.json({ error: 'Title is required (max 120 characters).' }, { status: 400 })
    }
    if (!bodyText || bodyText.length > 2000) {
      return NextResponse.json({ error: 'Message is required (max 2000 characters).' }, { status: 400 })
    }

    const data: { url?: string } = {}
    if (urlRaw) {
      if (!urlRaw.startsWith('/')) {
        return NextResponse.json(
          { error: 'URL must be a relative app path starting with / (e.g. /events).' },
          { status: 400 }
        )
      }
      data.url = urlRaw
    }

    const result = await sendPushToAllUsers(
      supabase,
      {
        title,
        body: bodyText,
        ...(Object.keys(data).length ? { data } : {}),
      },
      'new_events',
      { bypassCategoryPrefs: true }
    )

    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
      skippedUsers: result.skippedUsers,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('admin/push-broadcast:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
