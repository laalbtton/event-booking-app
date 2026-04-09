import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

const FLAG_KEY = 'instagram_username_prompt'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((profile as { role?: string } | null)?.role === 'admin') return true
  const { data: adminUser } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  return Boolean(adminUser)
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isSuperAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const { data, error } = await supabase.from('system_feature_flags').select('enabled').eq('key', FLAG_KEY).maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const enabled = data ? Boolean((data as { enabled?: boolean }).enabled) : true
    return NextResponse.json({ enabled })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isSuperAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const enabled = body?.enabled
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const { error } = await supabase.from('system_feature_flags').upsert(
      {
        key: FLAG_KEY,
        enabled,
        updated_at: new Date().toISOString(),
        updated_by: authData.user.id,
      },
      { onConflict: 'key' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ enabled })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
