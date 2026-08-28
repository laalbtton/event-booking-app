/**
 * GET /api/events/notify-open-roles
 *
 * Daily sweep that prompts confirmed performers to claim the optional roles
 * (Time Keeper, Setup/Wrapup) still unfilled on upcoming comedy open mics.
 *
 * Both roles are offered by default, which means the moment they become
 * "available" is event creation — before anyone has registered. So the prompt is
 * driven from here instead, once the lineup actually exists.
 *
 * The window is deliberately wider than the daily cadence so no event can slip
 * through between runs; promptOpenPerformerRoles stamps notified_at, which is
 * what stops a performer being asked twice.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { promptOpenPerformerRoles } from '@/lib/server/performerRoleNotify'
import { eventOffersPerformerRoles } from '@/lib/performerRoles'

const LOOKAHEAD_HOURS = 48

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const now = new Date()
    const until = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000)

    const { data: events, error } = await supabase
      .from('events')
      .select('id, title, date, event_type, open_mic_type, status')
      .eq('event_type', 'open_mic')
      .eq('status', 'active')
      .gte('date', now.toISOString())
      .lte('date', until.toISOString())

    if (error) {
      console.error('[notify-open-roles] event query failed', error)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
    }

    const eligible = (events ?? []).filter((event) => eventOffersPerformerRoles(event))

    const results = []
    for (const event of eligible) {
      const result = await promptOpenPerformerRoles(supabase, event.id)
      if (result.roleKeys.length > 0) {
        results.push({ ...result, title: event.title })
      }
    }

    const summary = {
      eventsScanned: eligible.length,
      eventsPrompted: results.length,
      performersNotified: results.reduce((total, r) => total + r.performers, 0),
      pushSent: results.reduce((total, r) => total + r.sent, 0),
      pushFailed: results.reduce((total, r) => total + r.failed, 0),
      results,
    }

    console.log('[notify-open-roles]', JSON.stringify(summary))
    return NextResponse.json({ success: true, ...summary })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[notify-open-roles]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
