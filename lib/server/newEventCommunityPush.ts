import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/server/push'

export type NewEventCommunityPushResult = {
  sent: number
  failed: number
  skippedUsers: number
  memberCount: number
}

/**
 * Send "new event" push to members of approved communities linked to an active event.
 * Does not broadcast to all platform users.
 */
export async function sendNewEventPushToCommunityMembers(
  supabase: SupabaseClient,
  eventId: string,
  communityIds?: string[],
): Promise<NewEventCommunityPushResult> {
  const empty = { sent: 0, failed: 0, skippedUsers: 0, memberCount: 0 }

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('id, title, slug, status')
    .eq('id', eventId)
    .maybeSingle()

  if (eventErr || !event) return empty
  if ((event.status as string) !== 'active') return empty

  let targetCommunityIds = communityIds?.filter(Boolean) ?? []
  if (targetCommunityIds.length === 0) {
    const { data: links } = await supabase
      .from('event_communities')
      .select('community_id')
      .eq('event_id', eventId)
      .eq('status', 'approved')

    targetCommunityIds = [
      ...new Set((links ?? []).map((r) => r.community_id as string).filter(Boolean)),
    ]
  }

  if (targetCommunityIds.length === 0) return empty

  const { data: members, error: memErr } = await supabase
    .from('community_members')
    .select('user_id')
    .in('community_id', targetCommunityIds)

  if (memErr || !members?.length) return empty

  const userIds = [...new Set(members.map((m) => m.user_id as string).filter(Boolean))]
  const eventPath = `/events/${(event.slug as string | null) || event.id}`
  const title = (event.title as string) || 'New event'

  let sent = 0
  let failed = 0
  let skippedUsers = 0

  for (const userId of userIds) {
    const result = await sendPushToUser(
      supabase,
      userId,
      {
        title: 'New event in your community',
        body: `"${title}" is now available. Check it out!`,
        data: { url: eventPath },
      },
      'new_events',
    )
    sent += result.sent ?? 0
    failed += result.failed ?? 0
    if ('skipped' in result && result.skipped) skippedUsers += 1
  }

  return { sent, failed, skippedUsers, memberCount: userIds.length }
}
