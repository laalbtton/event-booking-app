import { getPublicServerClient } from '@/lib/server/supabasePublic'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { fetchEventsByIds } from '@/lib/server/publicContent'
import type { PublicEventDetails } from '@/lib/server/publicContent'

/**
 * Returns a Supabase client that can read community_members.
 * The community_members RLS policy is TO authenticated, so the anon key
 * cannot read it. We use the service-role key (bypasses RLS) as a fallback
 * until the public-read policy is added via SQL migration.
 */
function getMemberCountClient() {
  return getAdminClient() ?? getPublicServerClient()
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type PublicCommunity = {
  id: string
  name: string
  slug: string | null
  description: string | null
  location: string | null
  language: string | null
  avatarUrl: string | null
  bannerUrl: string | null
  memberCount: number
  upcomingEventCount: number
}

export type PublicCommunityDetail = PublicCommunity & {
  upcomingEvents: PublicEventDetails[]
}

export async function listPublicCommunities(): Promise<PublicCommunity[]> {
  const supabase = getPublicServerClient()

  const { data: communities } = await supabase
    .from('communities')
    .select('id, name, slug, description, location, language, avatar_url, banner_url')
    .eq('is_public', true)
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (!communities || communities.length === 0) return []

  const communityIds = communities.map((c: any) => c.id as string)

  const memberClient = getMemberCountClient()

  const [memberCountsRes, eventCountsRes] = await Promise.all([
    memberClient
      .from('community_members')
      .select('community_id')
      .in('community_id', communityIds),
    supabase
      .from('event_communities')
      .select('community_id, events(date, status)')
      .in('community_id', communityIds)
      .eq('status', 'approved'),
  ])

  const memberCounts = new Map<string, number>()
  ;((memberCountsRes.data as any[]) || []).forEach((row) => {
    const id = row.community_id as string
    memberCounts.set(id, (memberCounts.get(id) || 0) + 1)
  })

  const now = new Date()
  const upcomingEventCounts = new Map<string, number>()
  ;((eventCountsRes.data as any[]) || []).forEach((row) => {
    const event = row.events as { date: string; status: string | null } | null
    if (!event) return
    if (['cancelled', 'archived', 'draft', 'private'].includes((event.status || '').toLowerCase())) return
    if (new Date(event.date) < now) return
    const id = row.community_id as string
    upcomingEventCounts.set(id, (upcomingEventCounts.get(id) || 0) + 1)
  })

  return communities.map((c: any) => ({
    id: c.id as string,
    name: c.name as string,
    slug: c.slug as string | null,
    description: c.description as string | null,
    location: c.location as string | null,
    language: c.language as string | null,
    avatarUrl: c.avatar_url as string | null,
    bannerUrl: c.banner_url as string | null,
    memberCount: memberCounts.get(c.id) || 0,
    upcomingEventCount: upcomingEventCounts.get(c.id) || 0,
  }))
}

export async function getPublicCommunity(idOrSlug: string): Promise<PublicCommunityDetail | null> {
  const supabase = getPublicServerClient()

  const isUuid = UUID_RE.test(idOrSlug)
  let query = supabase
    .from('communities')
    .select('id, name, slug, description, location, language, avatar_url, banner_url')
    .eq('is_public', true)
    .eq('status', 'active')

  query = isUuid ? query.eq('id', idOrSlug) : query.eq('slug', idOrSlug)

  const { data: community } = await query.maybeSingle()
  if (!community) return null

  const communityId = (community as any).id as string

  const memberClient = getMemberCountClient()

  const [memberCountRes, eventLinksRes] = await Promise.all([
    memberClient
      .from('community_members')
      .select('id', { count: 'exact', head: true })
      .eq('community_id', communityId),
    supabase
      .from('event_communities')
      .select('event_id')
      .eq('community_id', communityId)
      .eq('status', 'approved'),
  ])

  const eventIds = ((eventLinksRes.data as any[]) || []).map((r) => r.event_id as string)
  const now = new Date()

  const allEventDetails = await fetchEventsByIds(eventIds)
  const upcomingEvents = allEventDetails
    .filter((e) => !['cancelled', 'archived', 'draft', 'private'].includes((e.status || '').toLowerCase()))
    .filter((e) => new Date(e.startDate) >= now)
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  return {
    id: communityId,
    name: (community as any).name as string,
    slug: (community as any).slug as string | null,
    description: (community as any).description as string | null,
    location: (community as any).location as string | null,
    language: (community as any).language as string | null,
    avatarUrl: (community as any).avatar_url as string | null,
    bannerUrl: (community as any).banner_url as string | null,
    memberCount: memberCountRes.count || 0,
    upcomingEventCount: upcomingEvents.length,
    upcomingEvents,
  }
}
