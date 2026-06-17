import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((data as { role?: string } | null)?.role === 'admin') return true
  const { data: adminFallback } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!adminFallback
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let str: string
  if (Array.isArray(value)) str = value.join('; ')
  else if (typeof value === 'boolean') str = value ? 'Yes' : 'No'
  else str = String(value)
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const HEADERS = [
  'Name',
  'Email',
  'City',
  'Age Range',
  'Canada Status',
  'Comedy Preferences',
  'Event Interests',
  'Ticket Price Range',
  'Attendance Frequency',
  'Credits Earned',
  'Signup Completed',
  'Email Opt-In',
  'Created Date',
]

/** Admin: download founding members as CSV. */
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('founding_members')
      .select(
        'first_name, email, city, age_range, canada_status, comedy_preferences, event_interests, ticket_price_range, attendance_frequency, total_credits_earned, signup_completed, email_updates_opt_in, created_at',
      )
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data || []).map((m: any) => [
      m.first_name,
      m.email,
      m.city,
      m.age_range,
      m.canada_status,
      m.comedy_preferences,
      m.event_interests,
      m.ticket_price_range,
      m.attendance_frequency,
      m.total_credits_earned,
      m.signup_completed,
      m.email_updates_opt_in,
      m.created_at ? new Date(m.created_at).toISOString() : '',
    ])

    const csv = [HEADERS, ...rows].map((row) => row.map(csvCell).join(',')).join('\n')
    const filename = `brampton-comedy-insider-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
