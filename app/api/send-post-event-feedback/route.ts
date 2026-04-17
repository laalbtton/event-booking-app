/**
 * POST /api/send-post-event-feedback
 *
 * Manual trigger to send post-event feedback emails for a specific event.
 * Useful for past events or one-off sends.
 *
 * Body: { eventId: string }
 * Auth: Bearer CRON_SECRET  OR  a valid admin user JWT
 *
 * The automated path uses Inngest (event/scheduled → sleepUntil → send).
 * This endpoint bypasses Inngest and sends immediately.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendFeedbackEmailsForEvent } from '@/lib/server/postEventFeedback'

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const isCronAuth = cronSecret && authHeader === `Bearer ${cronSecret}`

    if (!isCronAuth) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const supabase = getAdminSupabase()
      const { data: authData } = await supabase.auth.getUser(token)
      if (!authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authData.user.id)
        .single()

      if ((profile as { role?: string } | null)?.role !== 'admin') {
        return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
      }
    }

    const body = await request.json().catch(() => ({})) as { eventId?: string }
    if (!body.eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

    const result = await sendFeedbackEmailsForEvent(body.eventId)
    return NextResponse.json({ success: true, eventId: body.eventId, ...result })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
