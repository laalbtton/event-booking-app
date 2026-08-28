import type { SupabaseClient } from '@supabase/supabase-js'

export type EventManageAccess = {
  canManage: boolean
  isPlatformAdmin: boolean
  isCreatorOrHost: boolean
  isCommunityAdmin: boolean
  /** Communities linked to the event, used by host/member pickers. */
  communityIds: string[]
}

const NO_ACCESS: EventManageAccess = {
  canManage: false,
  isPlatformAdmin: false,
  isCreatorOrHost: false,
  isCommunityAdmin: false,
  communityIds: [],
}

/**
 * Resolves whether a user may manage an event.
 *
 * The rule is: the creator or assigned host, a platform admin, or an admin /
 * co-admin of any community the event is linked to. This lives here so the
 * several places that gate host-only actions cannot drift apart.
 *
 * Requires a service-role client — `event_communities` and `community_members`
 * have RLS that would otherwise hide links from the very user being checked.
 */
export async function resolveEventManageAccess(
  supabase: SupabaseClient,
  eventId: string,
  userId: string | null | undefined,
): Promise<EventManageAccess> {
  if (!userId) return NO_ACCESS

  const { data: event, error } = await supabase
    .from('events')
    .select('id, created_by, host_user_id')
    .eq('id', eventId)
    .maybeSingle()

  if (error || !event) return NO_ACCESS

  const isCreatorOrHost = event.created_by === userId || event.host_user_id === userId

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  const isPlatformAdmin = profile?.role === 'admin'

  const { data: links } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', eventId)
    .in('status', ['approved', 'pending'])

  const communityIds = [
    ...new Set((links ?? []).map((link: { community_id: string }) => link.community_id)),
  ]

  let isCommunityAdmin = false
  if (!isCreatorOrHost && !isPlatformAdmin && communityIds.length > 0) {
    const { count } = await supabase
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('community_id', communityIds)
      .in('role', ['admin', 'co_admin'])
    isCommunityAdmin = (count ?? 0) > 0
  }

  return {
    canManage: isCreatorOrHost || isPlatformAdmin || isCommunityAdmin,
    isPlatformAdmin,
    isCreatorOrHost,
    isCommunityAdmin,
    communityIds,
  }
}

type EventOwnership = {
  created_by?: string | null
  host_user_id?: string | null
}

/**
 * Boolean wrapper kept for existing callers (change-host, community commands).
 * New code should use `resolveEventManageAccess` so it gets the community IDs too.
 */
export async function userCanManageEvent(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  _event?: EventOwnership,
): Promise<boolean> {
  const access = await resolveEventManageAccess(supabase, eventId, userId)
  return access.canManage
}
