/**
 * POST /api/events/schedule-feedback
 *
 * Supabase Database Webhook receiver.
 * Supabase calls this endpoint whenever a row is INSERTed or UPDATEd
 * in the `events` table.
 *
 * What it does:
 *  - If the event is active:
 *      • Sends "event/scheduled"         → post-event feedback fires 1.5h after end
 *      • Sends "event/reminder-scheduled" → 48h pre-event reminder fires 48h before start
 *  - If the event is cancelled/archived:
 *      • Sends "event/cancelled"          → cancels feedback job
 *      • Sends "event/reminder-cancelled" → cancels reminder job
 *
 * Supabase Webhook setup (do this once in the Supabase Dashboard):
 *   Table: events  |  Events: INSERT, UPDATE  |  Type: HTTP Request
 *   URL: https://laalbutton.com/api/events/schedule-feedback
 *   HTTP Headers: x-webhook-secret: <SUPABASE_WEBHOOK_SECRET env var value>
 */

import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'

const CANCELLED_STATUSES = new Set(['cancelled', 'archived'])

export async function POST(request: NextRequest) {
  try {
    const secret = process.env.SUPABASE_WEBHOOK_SECRET
    if (secret) {
      const incoming = request.headers.get('x-webhook-secret')
      if (incoming !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    const record = (body.record ?? {}) as {
      id?: string
      date?: string
      end_time?: string | null
      status?: string | null
    }

    const eventId = record.id
    if (!eventId) return NextResponse.json({ ok: true, skipped: 'no id' })

    const status = (record.status ?? '').toLowerCase()

    if (CANCELLED_STATUSES.has(status)) {
      // Cancel both the feedback job and the reminder job
      await inngest.send([
        { name: 'event/cancelled',         data: { eventId } },
        { name: 'event/reminder-cancelled', data: { eventId } },
      ])
      return NextResponse.json({ ok: true, action: 'cancelled', eventId })
    }

    // Compute end time (feedback fires 1.5h after end)
    let endTimeIso: string
    if (record.end_time) {
      endTimeIso = record.end_time
    } else if (record.date) {
      endTimeIso = new Date(new Date(record.date).getTime() + 2 * 60 * 60 * 1000).toISOString()
    } else {
      return NextResponse.json({ ok: true, skipped: 'no date' })
    }

    // Start time is the event date field (ISO)
    const startTimeIso = record.date ? new Date(record.date).toISOString() : endTimeIso

    const now = new Date()

    // Only schedule if the event hasn't ended yet
    if (new Date(endTimeIso) <= now) {
      return NextResponse.json({ ok: true, skipped: 'event already ended' })
    }

    const events: { name: string; data: Record<string, unknown> }[] = [
      { name: 'event/scheduled', data: { eventId, endTimeIso, status } },
    ]

    // Only schedule reminder if event is more than 48h away
    const reminderAt = new Date(new Date(startTimeIso).getTime() - 48 * 60 * 60 * 1000)
    if (reminderAt > now) {
      events.push({ name: 'event/reminder-scheduled', data: { eventId, startTimeIso } })
    }

    await inngest.send(events)

    return NextResponse.json({
      ok: true,
      action: 'scheduled',
      eventId,
      feedbackAt: new Date(new Date(endTimeIso).getTime() + 90 * 60 * 1000).toISOString(),
      reminderAt: reminderAt > now ? reminderAt.toISOString() : 'skipped (< 48h away)',
    })
  } catch (err: unknown) {
    console.error('schedule-feedback webhook error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
