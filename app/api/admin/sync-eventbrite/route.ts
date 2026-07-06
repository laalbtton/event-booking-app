/**
 * POST /api/admin/sync-eventbrite
 *
 * Manual trigger for the Eventbrite sync. Protected by CRON_SECRET.
 * Usage: curl -X POST https://app.laalbutton.com/api/admin/sync-eventbrite \
 *          -H "Authorization: Bearer YOUR_CRON_SECRET"
 */

import { NextRequest, NextResponse } from 'next/server'
import { syncEventbriteEvents } from '@/lib/server/eventbriteSync'

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization') ?? ''
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncEventbriteEvents()
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
