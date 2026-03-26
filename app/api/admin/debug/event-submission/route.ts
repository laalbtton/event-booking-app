import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const EVENT_SUBMISSION_FLAG_KEY = 'enable_event_submission_to_communities'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((profile as { role?: string } | null)?.role === 'admin') return true
  const { data: adminUser } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  return Boolean(adminUser)
}

async function requireSuperAdmin(request: NextRequest) {
  const supabase = getAdminClient()
  if (!supabase) return { error: NextResponse.json({ error: 'Server config error' }, { status: 500 }), supabase: null, userId: null }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { error: NextResponse.json({ error: 'Missing auth token' }, { status: 401 }), supabase: null, userId: null }

  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), supabase: null, userId: null }
  }

  if (!(await isSuperAdmin(supabase, authData.user.id))) {
    return { error: NextResponse.json({ error: 'Super admin access required' }, { status: 403 }), supabase: null, userId: null }
  }

  return { error: null, supabase, userId: authData.user.id }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request)
    if (auth.error || !auth.supabase) return auth.error

    const { data, error } = await auth.supabase
      .from('system_feature_flags')
      .select('enabled')
      .eq('key', EVENT_SUBMISSION_FLAG_KEY)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ enabled: Boolean(data?.enabled) })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireSuperAdmin(request)
    if (auth.error || !auth.supabase || !auth.userId) return auth.error

    const body = await request.json().catch(() => ({}))
    const enabled = body?.enabled
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const { error } = await auth.supabase
      .from('system_feature_flags')
      .upsert(
        {
          key: EVENT_SUBMISSION_FLAG_KEY,
          enabled,
          updated_at: new Date().toISOString(),
          updated_by: auth.userId,
        },
        { onConflict: 'key' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ enabled })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
