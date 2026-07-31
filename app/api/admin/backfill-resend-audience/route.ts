/**
 * POST /api/admin/backfill-resend-audience
 *
 * One-time admin utility to add all existing users to the Resend audience segment.
 * Protected by CRON_SECRET (same secret used for cron jobs) OR a logged-in
 * app admin's session token — useful when CRON_SECRET isn't easily copyable
 * (e.g. marked sensitive in Vercel). See app/admin/resend-tools/page.tsx.
 *
 * Iterates profiles in pages of 100 to stay within API call limits.
 * Safe to run multiple times — upsertContact is idempotent.
 *
 * Usage:
 *   curl -X POST https://app.laalbutton.com/api/admin/backfill-resend-audience \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { upsertContact } from '@/lib/server/resendAudience'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((data as { role?: string } | null)?.role === 'admin') return true
  const { data: adminFallback } = await supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle()
  return !!adminFallback
}

const PAGE_SIZE = 100

export async function POST(request: Request) {
  const supabase = getAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  const isCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCronSecret) {
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  let added = 0
  let failed = 0
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('email, full_name')
      .not('email', 'is', null)
      .range(from, to)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[backfill-resend-audience] Supabase error:', error)
      return NextResponse.json({ error: error.message, added, failed }, { status: 500 })
    }

    if (!profiles || profiles.length === 0) break

    await Promise.allSettled(
      (profiles as { email: string; full_name: string | null }[]).map(async (p) => {
        if (!p.email) return
        const firstName = p.full_name?.split(' ')[0] ?? undefined
        try {
          await upsertContact(p.email, firstName)
          added++
        } catch {
          failed++
        }
      }),
    )

    if (profiles.length < PAGE_SIZE) break
    page++

    // Respect Resend rate limits: ~10 req/s is safe
    await new Promise((r) => setTimeout(r, 150))
  }

  console.info(`[backfill-resend-audience] Done: ${added} added, ${failed} failed.`)
  return NextResponse.json({ success: true, added, failed })
}
