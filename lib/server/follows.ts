/**
 * Follow graph + personalised feed.
 *
 * Product constraint: follower counts are never exposed to anyone other than
 * the account owner. Nothing in this module returns another user's follower
 * count, and the public profile only ever learns "am I following them".
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/server/push'

export type FollowedPerson = {
  id: string
  fullName: string | null
  username: string | null
  avatarUrl: string | null
  followedAt: string
}

export type ProfileSearchResult = {
  id: string
  fullName: string | null
  username: string | null
  avatarUrl: string | null
  bio: string | null
  role: string | null
  following: boolean
}

export type FeedReason =
  | { kind: 'community'; id: string; label: string }
  | { kind: 'host'; id: string; label: string; avatarUrl: string | null }
  | { kind: 'performer'; id: string; label: string; avatarUrl: string | null }

export type FeedEvent = {
  id: string
  slug: string | null
  title: string
  date: string
  endTime: string | null
  location: string | null
  venueName: string | null
  venueCity: string | null
  posterUrl: string | null
  eventType: string
  openMicType: string | null
  ticketsEnabled: boolean
  creditsRequired: number
  maxAttendees: number | null
  confirmedPerformers: number
  hostUserId: string | null
  hostName: string | null
  hostAvatarUrl: string | null
  reasons: FeedReason[]
}

export type FeedJoke = {
  id: string
  content: string
  createdAt: string
  authorId: string
  authorName: string | null
  authorUsername: string | null
  authorAvatarUrl: string | null
  reactions: { like: number; bomb: number; kill: number; laughter: number }
}

export async function listFollowingIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('profile_follows')
    .select('following_id')
    .eq('follower_id', userId)

  return [...new Set(((data ?? []) as { following_id: string }[]).map((r) => r.following_id))]
}

export async function listFollowing(
  supabase: SupabaseClient,
  userId: string,
): Promise<FollowedPerson[]> {
  const { data: follows } = await supabase
    .from('profile_follows')
    .select('created_at, following_id')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })

  const rows = (follows ?? []) as { created_at: string; following_id: string }[]
  if (rows.length === 0) return []

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', [...new Set(rows.map((r) => r.following_id))])

  const profileById = new Map(
    (
      (profiles ?? []) as {
        id: string
        full_name: string | null
        username: string | null
        avatar_url: string | null
      }[]
    ).map((p) => [p.id, p]),
  )

  const out: FollowedPerson[] = []
  for (const row of rows) {
    const p = profileById.get(row.following_id)
    if (!p) continue
    out.push({
      id: p.id,
      fullName: p.full_name,
      username: p.username,
      avatarUrl: p.avatar_url,
      followedAt: row.created_at,
    })
  }
  return out
}

export const PROFILE_SEARCH_MIN_LENGTH = 2
const PROFILE_SEARCH_LIMIT = 20

/**
 * Find people to follow by name or username.
 *
 * Must run on a service-role client: the `profiles` RLS policies only let a user
 * read their own row, so the same query from the browser returns nothing.
 * Returns public-safe fields only — never email or credit balances.
 */
export async function searchProfiles(
  supabase: SupabaseClient,
  userId: string,
  query: string,
): Promise<ProfileSearchResult[]> {
  // The pattern goes into a quoted PostgREST filter value, which tolerates
  // commas, parens and periods but not quotes or backslashes.
  const term = query.replace(/["\\]/g, '').trim()
  if (term.length < PROFILE_SEARCH_MIN_LENGTH) return []

  const pattern = `%${term}%`
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url, bio, role')
    .or(`full_name.ilike."${pattern}",username.ilike."${pattern}"`)
    .neq('id', userId)
    // Nulls last, so username-only profiles don't crowd out named ones.
    .order('full_name', { ascending: true, nullsFirst: false })
    .limit(PROFILE_SEARCH_LIMIT)

  if (error) throw error

  const rows = (data ?? []) as {
    id: string
    full_name: string | null
    username: string | null
    avatar_url: string | null
    bio: string | null
    role: string | null
  }[]
  if (rows.length === 0) return []

  const followingIds = new Set(await listFollowingIds(supabase, userId))

  return (
    rows
      // Nothing to render or link to without a name or a username.
      .filter((row) => !!(row.full_name?.trim() || row.username?.trim()))
      .map((row) => ({
        id: row.id,
        fullName: row.full_name,
        username: row.username,
        avatarUrl: row.avatar_url,
        bio: row.bio,
        role: row.role,
        following: followingIds.has(row.id),
      }))
  )
}

/** Only ever called for the signed-in user's own account. */
export async function countMyFollowers(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { count } = await supabase
    .from('profile_follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', userId)
  return count ?? 0
}

export async function isFollowing(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('profile_follows')
    .select('id')
    .eq('follower_id', followerId)
    .eq('following_id', followingId)
    .maybeSingle()
  return !!data
}

export async function followUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
): Promise<{ ok: true; alreadyFollowing: boolean } | { ok: false; error: string }> {
  if (followerId === followingId) {
    return { ok: false, error: 'You cannot follow yourself' }
  }

  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', followingId)
    .maybeSingle()
  if (!target) return { ok: false, error: 'User not found' }

  if (await isFollowing(supabase, followerId, followingId)) {
    return { ok: true, alreadyFollowing: true }
  }

  const { error } = await supabase
    .from('profile_follows')
    .insert({ follower_id: followerId, following_id: followingId })

  // Unique violation means a concurrent follow already landed — treat as success
  if (error && error.code !== '23505') {
    return { ok: false, error: error.message }
  }

  return { ok: true, alreadyFollowing: false }
}

export async function unfollowUser(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from('profile_follows')
    .delete()
    .eq('follower_id', followerId)
    .eq('following_id', followingId)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * In-app notification only (no push) when someone gains a follower — deliberate,
 * so following feels personal rather than like a score going up.
 */
export async function notifyNewFollower(
  supabase: SupabaseClient,
  followerId: string,
  followingId: string,
): Promise<void> {
  try {
    const { data: follower } = await supabase
      .from('profiles')
      .select('full_name, username')
      .eq('id', followerId)
      .maybeSingle()

    const name =
      (follower as { full_name?: string | null } | null)?.full_name?.trim() || 'Someone'

    await supabase.from('notifications').insert({
      user_id: followingId,
      type: 'new_follower',
      title: 'New follower',
      message: `${name} started following you. They'll see when you have an upcoming gig.`,
      read: false,
    })
  } catch (err) {
    console.error('[follows] notifyNewFollower failed:', err)
  }
}

type EventRow = {
  id: string
  slug: string | null
  title: string
  date: string
  end_time: string | null
  location: string | null
  venue_id: string | null
  poster_url: string | null
  event_type: string
  open_mic_type: string | null
  tickets_enabled: boolean | null
  credits_required: number | null
  max_attendees: number | null
  host_user_id: string | null
  status: string | null
}

const EVENT_COLUMNS =
  'id, slug, title, date, end_time, location, venue_id, poster_url, event_type, open_mic_type, tickets_enabled, credits_required, max_attendees, host_user_id, status'

/**
 * Upcoming events from the user's communities and from people they follow.
 *
 * A followed person surfaces an event two ways: they host it
 * (`events.host_user_id`) or they have a confirmed performer booking on it.
 */
export async function getFeedEvents(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number },
): Promise<FeedEvent[]> {
  const limit = options?.limit ?? 60
  const nowIso = new Date().toISOString()

  const [followingIds, communityRows] = await Promise.all([
    listFollowingIds(supabase, userId),
    supabase.from('community_members').select('community_id').eq('user_id', userId),
  ])

  const communityIds = [
    ...new Set(
      ((communityRows.data ?? []) as { community_id: string }[])
        .map((r) => r.community_id)
        .filter(Boolean),
    ),
  ]

  // Reason maps keyed by event id
  const reasonsByEvent = new Map<string, FeedReason[]>()
  const addReason = (eventId: string, reason: FeedReason) => {
    const list = reasonsByEvent.get(eventId) ?? []
    if (!list.some((r) => r.kind === reason.kind && r.id === reason.id)) {
      list.push(reason)
    }
    reasonsByEvent.set(eventId, list)
  }

  const candidateIds = new Set<string>()

  // ── Community events ────────────────────────────────────────────────
  const communityNameById = new Map<string, string>()
  if (communityIds.length > 0) {
    const [{ data: links }, { data: communities }] = await Promise.all([
      supabase
        .from('event_communities')
        .select('event_id, community_id')
        .in('community_id', communityIds)
        .eq('status', 'approved'),
      supabase.from('communities').select('id, name').in('id', communityIds),
    ])

    for (const c of (communities ?? []) as { id: string; name: string }[]) {
      communityNameById.set(c.id, c.name)
    }
    for (const link of (links ?? []) as { event_id: string; community_id: string }[]) {
      candidateIds.add(link.event_id)
      addReason(link.event_id, {
        kind: 'community',
        id: link.community_id,
        label: communityNameById.get(link.community_id) || 'Your community',
      })
    }
  }

  // ── Events involving people you follow ──────────────────────────────
  const followedById = new Map<string, { name: string; avatarUrl: string | null }>()
  if (followingIds.length > 0) {
    const { data: followedProfiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', followingIds)
    for (const p of (followedProfiles ?? []) as {
      id: string
      full_name: string | null
      avatar_url: string | null
    }[]) {
      followedById.set(p.id, {
        name: p.full_name?.trim() || 'Someone you follow',
        avatarUrl: p.avatar_url,
      })
    }

    const [{ data: hostedEvents }, { data: performerBookings }] = await Promise.all([
      supabase
        .from('events')
        .select('id, host_user_id')
        .in('host_user_id', followingIds)
        // Same window as the final query, so an in-progress show isn't dropped here.
        .or(`date.gte.${nowIso},end_time.gte.${nowIso}`),
      supabase
        .from('bookings')
        .select('event_id, user_id, status, booking_scope')
        .in('user_id', followingIds)
        .eq('status', 'confirmed'),
    ])

    for (const ev of (hostedEvents ?? []) as { id: string; host_user_id: string }[]) {
      candidateIds.add(ev.id)
      const person = followedById.get(ev.host_user_id)
      addReason(ev.id, {
        kind: 'host',
        id: ev.host_user_id,
        label: person?.name || 'Someone you follow',
        avatarUrl: person?.avatarUrl ?? null,
      })
    }

    for (const b of (performerBookings ?? []) as {
      event_id: string
      user_id: string
      booking_scope: string | null
    }[]) {
      if (b.booking_scope === 'audience') continue
      candidateIds.add(b.event_id)
      const person = followedById.get(b.user_id)
      addReason(b.event_id, {
        kind: 'performer',
        id: b.user_id,
        label: person?.name || 'Someone you follow',
        avatarUrl: person?.avatarUrl ?? null,
      })
    }
  }

  if (candidateIds.size === 0) return []

  const { data: eventRows } = await supabase
    .from('events')
    .select(EVENT_COLUMNS)
    .in('id', [...candidateIds])
    .eq('status', 'active')
    .or(`date.gte.${nowIso},end_time.gte.${nowIso}`)
    .order('date', { ascending: true })
    .limit(limit)

  const events = (eventRows ?? []) as EventRow[]
  if (events.length === 0) return []

  const venueIds = [...new Set(events.map((e) => e.venue_id).filter(Boolean))] as string[]
  const hostIds = [...new Set(events.map((e) => e.host_user_id).filter(Boolean))] as string[]
  const eventIds = events.map((e) => e.id)

  const [venuesRes, hostsRes, bookingsRes] = await Promise.all([
    venueIds.length > 0
      ? supabase.from('venues').select('id, name, city').in('id', venueIds)
      : Promise.resolve({ data: [] as { id: string; name: string; city: string | null }[] }),
    hostIds.length > 0
      ? supabase.from('profiles').select('id, full_name, avatar_url').in('id', hostIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; avatar_url: string | null }[] }),
    supabase
      .from('bookings')
      .select('event_id, booking_scope')
      .in('event_id', eventIds)
      .eq('status', 'confirmed'),
  ])

  const venueById = new Map(
    ((venuesRes.data ?? []) as { id: string; name: string; city: string | null }[]).map((v) => [
      v.id,
      v,
    ]),
  )
  const hostById = new Map(
    ((hostsRes.data ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]).map(
      (h) => [h.id, h],
    ),
  )

  const performerCountByEvent = new Map<string, number>()
  for (const b of (bookingsRes.data ?? []) as { event_id: string; booking_scope: string | null }[]) {
    if (b.booking_scope === 'audience') continue
    performerCountByEvent.set(b.event_id, (performerCountByEvent.get(b.event_id) ?? 0) + 1)
  }

  return events.map((ev) => {
    const venue = ev.venue_id ? venueById.get(ev.venue_id) : undefined
    const host = ev.host_user_id ? hostById.get(ev.host_user_id) : undefined
    return {
      id: ev.id,
      slug: ev.slug,
      title: ev.title,
      date: ev.date,
      endTime: ev.end_time,
      location: ev.location,
      venueName: venue?.name ?? null,
      venueCity: venue?.city ?? null,
      posterUrl: ev.poster_url,
      eventType: ev.event_type,
      openMicType: ev.open_mic_type,
      ticketsEnabled: ev.tickets_enabled === true,
      creditsRequired: ev.credits_required ?? 0,
      maxAttendees: ev.max_attendees,
      confirmedPerformers: performerCountByEvent.get(ev.id) ?? 0,
      hostUserId: ev.host_user_id,
      hostName: host?.full_name ?? null,
      hostAvatarUrl: host?.avatar_url ?? null,
      reasons: reasonsByEvent.get(ev.id) ?? [],
    }
  })
}

type JokeRow = {
  id: string
  user_id: string
  content: string
  created_at: string
  joke_reactions: { reaction_type: string }[] | null
}

/**
 * Recent jokes written by the people you follow.
 *
 * Jokes are world-readable (see supabase/jokes-tables.sql), so this needs no
 * special visibility handling — it is the same content as /jokes, narrowed to
 * the follow graph.
 */
export async function getFeedJokes(
  supabase: SupabaseClient,
  userId: string,
  options?: { limit?: number },
): Promise<FeedJoke[]> {
  const limit = options?.limit ?? 15

  const followingIds = await listFollowingIds(supabase, userId)
  if (followingIds.length === 0) return []

  const { data: jokeRows } = await supabase
    .from('jokes')
    .select('id, user_id, content, created_at, joke_reactions(reaction_type)')
    .in('user_id', followingIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  const jokes = (jokeRows ?? []) as JokeRow[]
  if (jokes.length === 0) return []

  const { data: authorRows } = await supabase
    .from('profiles')
    .select('id, full_name, username, avatar_url')
    .in('id', [...new Set(jokes.map((j) => j.user_id))])

  const authorById = new Map(
    (
      (authorRows ?? []) as {
        id: string
        full_name: string | null
        username: string | null
        avatar_url: string | null
      }[]
    ).map((a) => [a.id, a]),
  )

  return jokes.map((joke) => {
    const reactions = { like: 0, bomb: 0, kill: 0, laughter: 0 }
    for (const r of joke.joke_reactions ?? []) {
      if (r.reaction_type in reactions) {
        reactions[r.reaction_type as keyof typeof reactions] += 1
      }
    }

    const author = authorById.get(joke.user_id)
    return {
      id: joke.id,
      content: joke.content,
      createdAt: joke.created_at,
      authorId: joke.user_id,
      authorName: author?.full_name ?? null,
      authorUsername: author?.username ?? null,
      authorAvatarUrl: author?.avatar_url ?? null,
      reactions,
    }
  })
}

/**
 * Tell a person's followers that they have a new upcoming gig.
 * Push category `follows` is opt-out; the in-app notification always lands.
 */
export async function notifyFollowersOfGig(
  supabase: SupabaseClient,
  args: {
    actorUserId: string
    eventId: string
    role: 'host' | 'performer'
  },
): Promise<{ notified: number; sent: number; failed: number }> {
  const { actorUserId, eventId, role } = args
  const empty = { notified: 0, sent: 0, failed: 0 }

  try {
    const [{ data: followers }, { data: actor }, { data: event }] = await Promise.all([
      supabase.from('profile_follows').select('follower_id').eq('following_id', actorUserId),
      supabase.from('profiles').select('full_name').eq('id', actorUserId).maybeSingle(),
      supabase.from('events').select('id, slug, title, date, status').eq('id', eventId).maybeSingle(),
    ])

    if (!event || (event.status as string) !== 'active') return empty

    const followerIds = [
      ...new Set(((followers ?? []) as { follower_id: string }[]).map((f) => f.follower_id)),
    ]
    if (followerIds.length === 0) return empty

    const actorName =
      (actor as { full_name?: string | null } | null)?.full_name?.trim() || 'Someone you follow'
    const title = (event.title as string) || 'an event'
    const eventPath = `/events/${(event.slug as string | null) || event.id}`
    const body =
      role === 'host'
        ? `${actorName} is hosting "${title}".`
        : `${actorName} is performing at "${title}".`

    let sent = 0
    let failed = 0

    for (const followerId of followerIds) {
      await supabase.from('notifications').insert({
        user_id: followerId,
        type: 'followed_user_event',
        title: 'Someone you follow has a gig',
        message: body,
        related_event_id: event.id,
        read: false,
      })

      const result = await sendPushToUser(
        supabase,
        followerId,
        { title: 'Someone you follow has a gig', body, data: { url: eventPath } },
        'follows',
      )
      sent += result.sent ?? 0
      failed += result.failed ?? 0
    }

    return { notified: followerIds.length, sent, failed }
  } catch (err) {
    console.error('[follows] notifyFollowersOfGig failed:', err)
    return empty
  }
}
