/**
 * POST /api/admin/backfill-resend-audience
 *
 * One-time admin utility to add all existing users to the Resend audience segment.
 * Protected by CRON_SECRET (same secret used for cron jobs).
 *
 * Iterates profiles in pages of 100 to stay within API call limits.
 * Safe to run multiple times — upsertContact is idempotent.
 *
 * Usage:
 *   curl -X POST https://app.laalbutton.com/api/admin/backfill-resend-audience \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { upsertContact } from '@/lib/server/resendAudience'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const PAGE_SIZE = 100

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getAdminSupabase()
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
