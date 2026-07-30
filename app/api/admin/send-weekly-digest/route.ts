/**
 * POST /api/admin/send-weekly-digest
 *
 * Manually trigger the weekly community digest broadcast — bypasses the
 * Inngest Sunday 04:30 UTC schedule so it can be tested/verified on demand.
 * Protected by CRON_SECRET (same secret used for cron jobs).
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

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
