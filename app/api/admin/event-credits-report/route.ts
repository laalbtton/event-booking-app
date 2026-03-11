import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchEventCreditsReport, type EventCreditsReportRow } from '@/lib/eventCreditsReport'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
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
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!adminRow
}

export type { EventCreditsReportRow }

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

    const { searchParams } = new URL(request.url)
    const eventId = searchParams.get('eventId') || undefined
    const fromDate = searchParams.get('fromDate') || undefined
    const toDate = searchParams.get('toDate') || undefined
    const venueId = searchParams.get('venueId') || undefined

    const rows = await fetchEventCreditsReport(supabase, { eventId, fromDate, toDate, venueId })

    return NextResponse.json({ rows })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
