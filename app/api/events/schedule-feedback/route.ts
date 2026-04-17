/**
 * POST /api/events/schedule-feedback
 *
 * Supabase Database Webhook receiver.
 * Supabase calls this endpoint whenever a row is INSERTed or UPDATEd
 * in the `events` table.
 *
 * What it does:
 *  - If the event is active → sends an "event/scheduled" Inngest event so the
 *    post-event feedback function wakes up 1.5h after the event ends.
 *  - If the event is cancelled/archived → sends an "event/cancelled" Inngest
 *    event which auto-cancels any in-flight scheduled job for that event.
 *
 * Supabase Webhook setup (do this once in the Supabase Dashboard):
 *   Table: events
 *   Events: INSERT, UPDATE
 *   Type: HTTP Request (HTTPS)
 *   URL: https://your-app.vercel.app/api/events/schedule-feedback
 *   HTTP Headers:
 *     x-webhook-secret: <value of SUPABASE_WEBHOOK_SECRET env var>
 */

import { NextRequest, NextResponse } from 'next/server'
import { inngest } from '@/lib/inngest'

const CANCELLED_STATUSES = new Set(['cancelled', 'archived'])

export async function POST(request: NextRequest) {
  try {
    // Validate the shared secret Supabase sends with every webhook
    const secret = process.env.SUPABASE_WEBHOOK_SECRET
    if (secret) {
      const incoming = request.headers.get('x-webhook-secret')
      if (incoming !== secret) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

    // Supabase webhook payload shape: { type, table, schema, record, old_record }
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
      // Signal any sleeping Inngest job to cancel itself
      await inngest.send({
        name: 'event/cancelled',
        data: { eventId },
      })
      return NextResponse.json({ ok: true, action: 'cancelled', eventId })
    }

    // Compute the end time: use explicit end_time, or estimate start + 2h
    let endTimeIso: string
    if (record.end_time) {
      endTimeIso = record.end_time
    } else if (record.date) {
      endTimeIso = new Date(new Date(record.date).getTime() + 2 * 60 * 60 * 1000).toISOString()
    } else {
      return NextResponse.json({ ok: true, skipped: 'no date' })
    }

    // Only schedule if the event is in the future
    if (new Date(endTimeIso) <= new Date()) {
      return NextResponse.json({ ok: true, skipped: 'event already ended' })
    }

    await inngest.send({
      name: 'event/scheduled',
      data: { eventId, endTimeIso, status },
    })

    return NextResponse.json({ ok: true, action: 'scheduled', eventId, sendAt: new Date(new Date(endTimeIso).getTime() + 90 * 60 * 1000).toISOString() })
  } catch (err: unknown) {
    console.error('schedule-feedback webhook error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
