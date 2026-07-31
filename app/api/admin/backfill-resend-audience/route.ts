/**
 * POST /api/admin/backfill-resend-audience
 *
 * One-time admin utility to add all existing users to the Resend audience segment.
 * Protected by CRON_SECRET (same secret used for cron jobs) OR a logged-in
 * app admin's session token — useful when CRON_SECRET isn't easily copyable
 * (e.g. marked sensitive in Vercel). See app/admin/resend-tools/page.tsx.
 *
 * IMPORTANT — this endpoint is CHUNKED/RESUMABLE, not one-shot:
 *   - It previously fired all 100 contacts in a page at Resend concurrently,
 *     which blew past Resend's per-second rate limit. Most requests got
 *     silently 429'd, but the loop counted `added++` as soon as
 *     `upsertContact` resolved (it never throws by design, so a Resend
 *     outage can never block real user signups) — so the reported count
 *     looked fine (e.g. "171 added") even though only ~10 contacts actually
 *     landed in Resend.
 *   - Fix: process a small CHUNK per call, sequentially with a short delay
 *     between each contact (safe rate), and count based on upsertContact's
 *     *actual* returned result. The caller (see app/admin/resend-tools)
 *     loops this endpoint with `offset`/`nextOffset` until `done: true`,
 *     which also sidesteps Vercel's function timeout for large user bases.
 *
 * Usage (single chunk):
 *   curl -X POST "https://app.laalbutton.com/api/admin/backfill-resend-audience?offset=0" \
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

// Small chunk processed sequentially per call, well within Vercel's default
// function timeout even on the Hobby plan, and safely under Resend's rate
// limit (a per-contact delay is applied below).
const CHUNK_SIZE = 25
const DELAY_BETWEEN_CONTACTS_MS = 150

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0)

  const { count: total } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .not('email', 'is', null)

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('email, full_name')
    .not('email', 'is', null)
    .range(offset, offset + CHUNK_SIZE - 1)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[backfill-resend-audience] Supabase error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let added = 0
  let failed = 0
  const sampleErrors: string[] = []

  for (const p of (profiles as { email: string; full_name: string | null }[]) || []) {
    if (!p.email) continue
    const firstName = p.full_name?.split(' ')[0] ?? undefined
    const result = await upsertContact(p.email, firstName)
    if (result.success) {
      added++
    } else {
      failed++
      if (sampleErrors.length < 5) sampleErrors.push(result.error)
    }
    await sleep(DELAY_BETWEEN_CONTACTS_MS)
  }

  const processedCount = profiles?.length || 0
  const nextOffset = offset + processedCount
  const done = processedCount < CHUNK_SIZE

  console.info(
    `[backfill-resend-audience] Chunk [${offset}, ${nextOffset}): ${added} added, ${failed} failed. done=${done}`,
  )

  return NextResponse.json({
    success: true,
    added,
    failed,
    processed: processedCount,
    offset,
    nextOffset,
    total: total ?? undefined,
    done,
    sampleErrors: sampleErrors.length > 0 ? sampleErrors : undefined,
  })
}
