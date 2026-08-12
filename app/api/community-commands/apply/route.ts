/**
 * POST /api/community-commands/apply
 *
 * Body: {
 *   communityId: string,
 *   commandType?: 'assign_hosts',
 *   assignments: [{ eventId: string, newHostUserId: string }]
 * }
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import {
  applyHostAssignment,
  userCanAccessCommunityCommands,
  userCanManageCommunity,
} from '@/lib/server/communityCommands'

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await userCanAccessCommunityCommands(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const communityId = typeof body?.communityId === 'string' ? body.communityId.trim() : ''
    const commandType = typeof body?.commandType === 'string' ? body.commandType : 'assign_hosts'
    const assignmentsRaw = Array.isArray(body?.assignments) ? body.assignments : []

    if (commandType !== 'assign_hosts') {
      return NextResponse.json({ error: `Unsupported commandType: ${commandType}` }, { status: 400 })
    }
    if (!communityId) {
      return NextResponse.json({ error: 'communityId is required' }, { status: 400 })
    }
    if (!(await userCanManageCommunity(supabase, user.id, communityId))) {
      return NextResponse.json({ error: 'You cannot manage this community' }, { status: 403 })
    }

    const assignments: { eventId: string; newHostUserId: string }[] = []
    for (const item of assignmentsRaw) {
      if (!item || typeof item !== 'object') continue
      const eventId = typeof item.eventId === 'string' ? item.eventId.trim() : ''
      const newHostUserId = typeof item.newHostUserId === 'string' ? item.newHostUserId.trim() : ''
      if (eventId && newHostUserId) assignments.push({ eventId, newHostUserId })
    }

    if (assignments.length === 0) {
      return NextResponse.json({ error: 'No valid assignments provided' }, { status: 400 })
    }

    // Ensure each event is linked to the selected community (scope guard)
    const eventIds = assignments.map((a) => a.eventId)
    const { data: links } = await supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', communityId)
      .in('event_id', eventIds)
      .in('status', ['approved', 'pending'])

    const linked = new Set(((links ?? []) as { event_id: string }[]).map((l) => l.event_id))

    const results: {
      eventId: string
      newHostUserId: string
      success: boolean
      error?: string
      newHostName?: string | null
    }[] = []

    for (const a of assignments) {
      if (!linked.has(a.eventId)) {
        results.push({
          ...a,
          success: false,
          error: 'Event is not linked to the selected community',
        })
        continue
      }
      const result = await applyHostAssignment(supabase, {
        eventId: a.eventId,
        newHostUserId: a.newHostUserId,
        actorUserId: user.id,
      })
      if (result.success) {
        results.push({
          ...a,
          success: true,
          newHostName: result.newHostName,
        })
      } else {
        results.push({ ...a, success: false, error: result.error })
      }
    }

    const applied = results.filter((r) => r.success).length
    const failed = results.length - applied

    return NextResponse.json({ success: failed === 0, applied, failed, results })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[community-commands/apply]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
