/**
 * POST /api/admin/send-weekly-digest
 *
 * Manually trigger the weekly community digest broadcast — bypasses the
 * Inngest Sunday 04:30 UTC schedule so it can be tested/verified on demand.
 * Protected by CRON_SECRET (same secret used for cron jobs) OR a logged-in
 * app admin's session token — useful when CRON_SECRET isn't easily copyable
 * (e.g. marked sensitive in Vercel). See app/admin/resend-tools/page.tsx.
 *
 * Usage:
 *   curl -X POST https://app.laalbutton.com/api/admin/send-weekly-digest \
 *     -H "Authorization: Bearer YOUR_CRON_SECRET"
 *
 * Returns a JSON summary including broadcastId, eventCount, and (on failure)
 * a specific `error` describing exactly what's misconfigured — e.g. a missing
 * RESEND_SEGMENT_ID env var, which is required for the broadcast (marketing)
 * send path and is NOT the same var used for transactional email.
 */

import { NextResponse } from 'next/server'
import { sendBroadcastWeeklyDigest } from '@/lib/server/weeklyDigest'
import { getMissingBroadcastConfig } from '@/lib/server/resendAudience'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((data as { role?: string } | null)?.role === 'admin') return true
  const { data: adminFallback } = await supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle()
  return !!adminFallback
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCronSecret) {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const missingConfig = getMissingBroadcastConfig()

  try {
    const result = await sendBroadcastWeeklyDigest()

    return NextResponse.json({
      success: !!result.broadcastId,
      ...result,
      missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
    })
  } catch (error: any) {
    console.error('[send-weekly-digest] Unexpected error:', error)
    return NextResponse.json(
      {
        error: error?.message || 'Unknown error',
        missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
      },
      { status: 500 },
    )
  }
}
