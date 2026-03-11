import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

type ProfileAdminRow = { id: string }
type AdminUserRow = { user_id: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdminUserIds(supabase: any): Promise<string[]> {
  const ids = new Set<string>()

  const { data: profileAdmins } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
  if (profileAdmins) {
    for (const row of profileAdmins as ProfileAdminRow[]) ids.add(row.id)
  }

  const { data: adminUsers } = await supabase
    .from('admin_users')
    .select('user_id')
  if (adminUsers) {
    for (const row of adminUsers as AdminUserRow[]) ids.add(row.user_id)
  }

  return Array.from(ids)
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

    const body = await request.json().catch(() => ({}))
    const message = typeof body?.message === 'string' ? body.message.trim() || null : null

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', authData.user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })
    if (profile.role === 'event_creator' || profile.role === 'admin') {
      return NextResponse.json({ error: 'Already has event creator or admin role' }, { status: 400 })
    }

    const { error: insertError } = await supabase.from('role_change_requests').insert({
      user_id: authData.user.id,
      requested_role: 'event_creator',
      from_role: (profile as { role?: string }).role || 'audience_member',
      message,
      status: 'pending',
    })

    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 })

    const adminIds = await getAdminUserIds(supabase)
    const applicantName = (profile as { full_name?: string }).full_name || authData.user.email || 'A user'
    const title = 'New Event Creator Request'
    const notificationMessage = `${applicantName} has requested to become an event creator. Review the request in the admin panel.`

    for (const adminId of adminIds) {
      await supabase.rpc('create_notification', {
        p_user_id: adminId,
        p_type: 'event_creator_request',
        p_title: title,
        p_message: notificationMessage,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('apply-event-creator error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
