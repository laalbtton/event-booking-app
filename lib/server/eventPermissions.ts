import type { SupabaseClient } from '@supabase/supabase-js'

type EventOwnership = {
  created_by: string | null
  host_user_id: string | null
}

/**
 * Returns true if the given user is allowed to manage (edit/cancel/change host
 * of) the given event.
 *
 * Permitted when any of these is true:
 *  - The user is the event creator (`created_by`)
 *  - The user is the current host (`host_user_id`)
 *  - The user has the platform `admin` role
 *  - The user has `co_admin` or `admin` role in any community linked to the event
 */
export async function userCanManageEvent(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  event: EventOwnership
): Promise<boolean> {
  if (event.created_by === userId || event.host_user_id === userId) return true

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if (profile?.role === 'admin') return true

  // Check community co-admin / admin membership for any community linked to this event.
  const { data: links } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', eventId)
    .in('status', ['approved', 'pending'])

  const communityIds = [
    ...new Set((links ?? []).map((l: { community_id: string }) => l.community_id)),
  ]
  if (communityIds.length === 0) return false

  const { count, error } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('community_id', communityIds)
    .in('role', ['admin', 'co_admin'])

  return !error && (count ?? 0) > 0
}

/**
 * Returns the community IDs that link a given user (as co_admin or admin)
 * to a given event.  Useful for constraining host selections to members of
 * the relevant communities.
 */
export async function getCommunityIdsForEventAdmin(
  supabase: SupabaseClient,
  eventId: string,
  userId: string
): Promise<string[]> {
  const { data: links } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', eventId)
    .in('status', ['approved', 'pending'])

  const communityIds = [
    ...new Set((links ?? []).map((l: { community_id: string }) => l.community_id)),
  ]
  if (communityIds.length === 0) return []

  const { data: memberships } = await supabase
    .from('community_members')
    .select('community_id')
    .eq('user_id', userId)
    .in('community_id', communityIds)
    .in('role', ['admin', 'co_admin'])

  return (memberships ?? []).map((m: { community_id: string }) => m.community_id)
}
