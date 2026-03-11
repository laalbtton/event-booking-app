import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { fetchEventCreditsReport } from '@/lib/eventCreditsReport'

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

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`
    }
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
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

    const isAdmin = await resolveAdminUser(supabase, authData.user.id)
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim() : authData.user.email
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const fromDate = typeof body?.fromDate === 'string' ? body.fromDate : undefined
    const toDate = typeof body?.toDate === 'string' ? body.toDate : undefined
    const venueId = typeof body?.venueId === 'string' ? body.venueId : undefined

    const rows = await fetchEventCreditsReport(supabase, { fromDate, toDate, venueId })
    const csvRows = rows.map((r: any) => ({
      'Event ID': r.eventId,
      'Event Title': r.eventTitle,
      'Event Date': r.eventDate,
      'Venue': r.venueName ?? '—',
      'Venue Credits': r.venueVouchersTotalCents != null && r.venueVouchersTotalCents > 0
        ? `$${(r.venueVouchersTotalCents / 100).toFixed(2)}`
        : '—',
      'Total Credits Used': r.totalCreditsUsed,
      'Booking Count': r.bookingCount,
      'Purchased': r.purchasedCreditsUsed ?? '—',
      'Complimentary': r.complimentaryCreditsUsed ?? '—',
    }))
    const csv = rowsToCsv(csvRows)

    const html = `<p>Event credits report attached. Total events: ${rows.length}.</p><p>Generated on ${new Date().toISOString()}.</p>`
    const success = await sendEmail({
      to: email,
      subject: 'Event Credits Report - One Mic Stand',
      html,
      attachments: [
        {
          filename: `event-credits-report-${new Date().toISOString().slice(0, 10)}.csv`,
          content: Buffer.from(csv, 'utf-8').toString('base64'),
        },
      ],
    })

    if (!success) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, sentTo: email })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
