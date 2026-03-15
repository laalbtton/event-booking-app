import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

type ProfileAdminRow = { id: string }
type AdminUserRow = { user_id: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdminUserIds(supabase: any): Promise<string[]> {
  const ids = new Set<string>()
  const { data: profileAdmins } = await supabase.from('profiles').select('id').eq('role', 'admin')
  if (profileAdmins) for (const row of profileAdmins as ProfileAdminRow[]) ids.add(row.id)
  const { data: adminUsers } = await supabase.from('admin_users').select('user_id')
  if (adminUsers) for (const row of adminUsers as AdminUserRow[]) ids.add(row.user_id)
  return Array.from(ids)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const { name, description, location, language, message } = body

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Community name is required' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authData.user.id)
      .single()

    const { error: insertError } = await supabase.from('community_creation_requests').insert({
      user_id: authData.user.id,
      name: name.trim(),
      description: description || null,
      location: location || null,
      language: language || null,
      message: message || null,
      status: 'pending',
    })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    const adminIds = await getAdminUserIds(supabase)
    const applicantName = (profile as { full_name?: string } | null)?.full_name || authData.user.email || 'A user'

    for (const adminId of adminIds) {
      await supabase.rpc('create_notification', {
        p_user_id: adminId,
        p_type: 'community_creation_request',
        p_title: 'New Community Creation Request',
        p_message: `${applicantName} has requested to create a community named "${name.trim()}". Review in admin panel.`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
