/**
 * POST /api/send-post-event-feedback
 *
 * Manual trigger to send post-event feedback emails for a specific event.
 * Useful for past events or one-off sends (e.g. the "Email Attendees" button).
 *
 * Body: { eventId: string; subject?: string; customNote?: string }
 * Auth: Bearer CRON_SECRET  OR  a valid admin/host user JWT
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

    let authedUserId: string | null = null

    if (!isCronAuth) {
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
      if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      const supabase = getAdminSupabase()
      const { data: authData } = await supabase.auth.getUser(token)
      if (!authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

      authedUserId = authData.user.id
    }

    const body = await request.json().catch(() => ({})) as {
      eventId?: string
      subject?: string
      customNote?: string
    }
    if (!body.eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 })

    // Non-cron callers must be admin, the event host, or the event creator
    if (!isCronAuth && authedUserId) {
      const supabase = getAdminSupabase()

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', authedUserId)
        .single()

      const isAdmin = (profile as { role?: string } | null)?.role === 'admin'

      if (!isAdmin) {
        // Allow event host / creator
        const { data: ev } = await supabase
          .from('events')
          .select('host_user_id, created_by')
          .eq('id', body.eventId)
          .single()

        const isHost =
          ev?.host_user_id === authedUserId || ev?.created_by === authedUserId

        if (!isHost) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
      }
    }

    const result = await sendFeedbackEmailsForEvent(body.eventId, {
      subject: body.subject,
      customNote: body.customNote,
    })
    return NextResponse.json({ success: true, eventId: body.eventId, ...result })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
