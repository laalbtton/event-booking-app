import type { SupabaseClient } from '@supabase/supabase-js'

type CommunityIdRow = { id: string }

/**
 * If the user has zero community memberships, join every public + active
 * community as a regular member. No-op if they already belong to any.
 */
export async function ensureDefaultCommunityMemberships(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ joined: number; communityIds: string[] }> {
  const { count, error: countError } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) throw countError
  if ((count ?? 0) > 0) {
    return { joined: 0, communityIds: [] }
  }

  const { data: communities, error: commError } = await supabase
    .from('communities')
    .select('id')
    .eq('is_public', true)
    .eq('status', 'active')

  if (commError) throw commError

  const communityIds = ((communities || []) as CommunityIdRow[]).map((c) => c.id)
  if (communityIds.length === 0) {
    return { joined: 0, communityIds: [] }
  }

  const { error: insertError } = await supabase.from('community_members').upsert(
    communityIds.map((community_id) => ({
      community_id,
      user_id: userId,
      role: 'member',
    })),
    { onConflict: 'community_id,user_id', ignoreDuplicates: true },
  )

  if (insertError) throw insertError

  return { joined: communityIds.length, communityIds }
}
