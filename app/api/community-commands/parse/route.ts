/**
 * POST /api/community-commands/parse
 *
 * Body: { communityId: string, prompt: string, commandType?: 'assign_hosts' }
 * Returns a preview of resolved event↔host assignments. No writes.
 */

import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import {
  resolveHostAssignments,
  userCanAccessCommunityCommands,
  userCanManageCommunity,
} from '@/lib/server/communityCommands'
import { extractHostAssignmentsFromPrompt } from '@/lib/server/communityCommandLlm'

export async function POST(request: Request) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await userCanAccessCommunityCommands(supabase, user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const communityId = typeof body?.communityId === 'string' ? body.communityId.trim() : ''
    const prompt = typeof body?.prompt === 'string' ? body.prompt : ''
    const commandType = typeof body?.commandType === 'string' ? body.commandType : 'assign_hosts'

    if (commandType !== 'assign_hosts') {
      return NextResponse.json({ error: `Unsupported commandType: ${commandType}` }, { status: 400 })
    }
    if (!communityId) {
      return NextResponse.json({ error: 'communityId is required' }, { status: 400 })
    }
    if (!prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (!(await userCanManageCommunity(supabase, user.id, communityId))) {
      return NextResponse.json({ error: 'You cannot manage this community' }, { status: 403 })
    }

    const extracted = await extractHostAssignmentsFromPrompt(prompt)
    if (!extracted.ok) {
      return NextResponse.json({ error: extracted.error }, { status: 400 })
    }

    const rows = await resolveHostAssignments({
      supabase,
      communityId,
      extracted: extracted.assignments,
    })

    return NextResponse.json({
      commandType: 'assign_hosts',
      communityId,
      rows,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('[community-commands/parse]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
