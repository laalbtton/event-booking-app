import type { SupabaseClient } from '@supabase/supabase-js'

type EventHostFields = {
  host_user_id: string | null
  created_by: string | null
}

/**
 * Who may turn event chat on/off or change chat_mode (API + UI).
 * Host/creator, platform admin, or community admin/co_admin for a linked community.
 */
export async function userCanManageEventChatSettings(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
  event: EventHostFields
): Promise<boolean> {
  if (event.host_user_id === userId || event.created_by === userId) return true

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if (profile?.role === 'admin') return true

  const { data: links } = await supabase
    .from('event_communities')
    .select('community_id')
    .eq('event_id', eventId)
    .in('status', ['approved', 'pending'])

  const communityIds = [...new Set((links || []).map((l: { community_id: string }) => l.community_id))]
  if (communityIds.length === 0) return false

  const { count, error } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('community_id', communityIds)
    .in('role', ['admin', 'co_admin'])

  return !error && (count ?? 0) > 0
}
