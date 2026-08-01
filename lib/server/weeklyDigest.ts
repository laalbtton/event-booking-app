/**
 * Weekly community digest sender.
 *
 * New path (broadcast): builds ONE email and sends it as a single Resend Broadcast
 * to the entire segment — no per-user loop, no daily-limit batching.
 *
 * Legacy path (per-user batches) is preserved below for reference / rollback.
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { getWeeklyDigestEmail, getBroadcastWeeklyDigestEmail, type DigestCommunitySection, type DigestEvent } from '@/lib/email'
import { getEmailTemplate, interpolate, TEMPLATE_KEYS } from '@/lib/server/emailTemplates'
import { addCalendarDaysToYmd, getEasternCalendarDateString } from '@/lib/dateUtils'
import { getSiteUrl, buildEventUrl, validateBaseUrl } from '@/lib/server/emailUrl'
import { sendBroadcast, getMissingBroadcastConfig } from '@/lib/server/resendAudience'
import {
  absolutizePosterUrl,
  resolveEventDisplayPosterUrl,
} from '@/lib/eventPosterDefaults'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

type DigestVenue = { name: string; city?: string | null }

function resolveDigestPosterUrl(args: {
  posterUrl: string | null
  startDate: string
  locationText: string
  venue: DigestVenue | null
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
  siteUrl: string
}): string | null {
  const resolved = resolveEventDisplayPosterUrl({
    posterUrl: args.posterUrl,
    startDate: args.startDate,
    locationText: args.locationText,
    venue: args.venue
      ? { name: args.venue.name, city: args.venue.city ?? undefined }
      : null,
    eventType: args.eventType,
    openMicType: args.openMicType,
    title: args.title,
  })
  return absolutizePosterUrl(resolved, args.siteUrl)
}

/** Booked shows first (by date), then open mics / everything else (by date). */
function sortDigestEventsBookedFirst<T extends { date: string; eventType?: string | null }>(
  events: T[],
): T[] {
  return [...events].sort((a, b) => {
    const aBooked = a.eventType === 'booked_show' ? 0 : 1
    const bBooked = b.eventType === 'booked_show' ? 0 : 1
    if (aBooked !== bBooked) return aBooked - bBooked
    return new Date(a.date).getTime() - new Date(b.date).getTime()
  })
}

/** Stable message fragment for deduplication queries */
export function weeklyDigestMessageMarker(weekKey: string) {
  return `· cycle ${weekKey}`
}

export type DigestResult = {
  emailsSent: number
  skipped: number
  errors: string[]
}

export type WeeklyDigestItem = {
  userId: string
  email: string
  name: string
  sections: DigestCommunitySection[]
}

export type WeeklyDigestPrepared = {
  weekKey: string
  siteUrl: string
  tmpl: { subject: string; intro: string; footer: string }
  items: WeeklyDigestItem[]
  /** Users not included because of batch cap */
  overflowCount: number
}

/**
 * Build recipient list + template. Does not send email.
 */
export async function prepareWeeklyDigest(): Promise<WeeklyDigestPrepared | null> {
  const supabase = getAdminSupabase()
  const siteUrl = getSiteUrl()
  const weekKey = getEasternCalendarDateString(new Date())

  // Validate the base URL before we build any links.  A wrong NEXT_PUBLIC_SITE_URL
  // causes every link in the digest to silently redirect to the homepage.
  const baseCheck = await validateBaseUrl()
  if (!baseCheck.ok) {
    console.error(
      `[weeklyDigest] Aborting: base URL "${siteUrl}" is unreachable. ${baseCheck.reason ?? ''}` +
      `  Fix: set NEXT_PUBLIC_SITE_URL=https://app.laalbutton.com in Vercel.`
    )
    return null
  }

  const todayStr = getEasternCalendarDateString(new Date())
  const cutoffStr = addCalendarDaysToYmd(todayStr, 14)

  const { data: rawEvents, error: evErr } = await supabase
    .from('events')
    .select('id, title, date, slug, location, venue_id, poster_url, event_type, open_mic_type')
    .gte('date', todayStr)
    .lte('date', cutoffStr)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')
    .order('date', { ascending: true })

  if (evErr || !rawEvents || rawEvents.length === 0) {
    return null
  }

  // Drop events whose slug AND id are both missing – they would generate a
  // broken URL like "https://app.laalbutton.com/events/undefined".
  const events = (rawEvents as { id: string; slug: string | null; venue_id: string | null }[]).filter((e) => {
    const url = buildEventUrl(e.slug ?? e.id)
    if (!url) {
      console.warn(`[weeklyDigest] Skipping event ${e.id}: cannot build a valid URL (slug=${e.slug}).`)
    }
    return !!url
  })

  if (events.length === 0) return null

  const eventIds = (events as { id: string }[]).map((e) => e.id)
  const venueIds = [
    ...new Set(
      events.map((e) => e.venue_id).filter(Boolean) as string[],
    ),
  ]

  const venueMap = new Map<string, DigestVenue>()
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name, city')
      .in('id', venueIds)
    ;((venues ?? []) as { id: string; name: string; city: string | null }[]).forEach((v) =>
      venueMap.set(v.id, { name: v.name, city: v.city }),
    )
  }

  const { data: links, error: linkErr } = await supabase
    .from('event_communities')
    .select('event_id, community_id, is_primary')
    .in('event_id', eventIds)
    .eq('status', 'approved')
    .order('is_primary', { ascending: false })

  if (linkErr || !links || links.length === 0) {
    return null
  }

  const eventAssignedComm = new Map<string, string>()
  ;(links as { event_id: string; community_id: string; is_primary: boolean }[]).forEach(
    ({ event_id, community_id, is_primary }) => {
      if (!eventAssignedComm.has(event_id) || is_primary) {
        eventAssignedComm.set(event_id, community_id)
      }
    },
  )

  const commToEvents = new Map<string, string[]>()
  for (const [event_id, community_id] of eventAssignedComm) {
    const arr = commToEvents.get(community_id) ?? []
    arr.push(event_id)
    commToEvents.set(community_id, arr)
  }

  const communityIds = [...commToEvents.keys()]

  const { data: communities } = await supabase
    .from('communities')
    .select('id, name')
    .in('id', communityIds)
    .eq('status', 'active')

  const communityMap = new Map<string, string>()
  ;((communities ?? []) as { id: string; name: string }[]).forEach((c) =>
    communityMap.set(c.id, c.name),
  )

  const { data: members, error: memberErr } = await supabase
    .from('community_members')
    .select('user_id, community_id')
    .in('community_id', communityIds)

  if (memberErr || !members || members.length === 0) {
    return null
  }

  const userCommMap = new Map<string, Map<string, string[]>>()
  ;(members as { user_id: string; community_id: string }[]).forEach(({ user_id, community_id }) => {
    const evIds = commToEvents.get(community_id)
    if (!evIds || evIds.length === 0) return
    const commMap = userCommMap.get(user_id) ?? new Map<string, string[]>()
    commMap.set(community_id, evIds)
    userCommMap.set(user_id, commMap)
  })

  if (userCommMap.size === 0) return null

  const userIds = [...userCommMap.keys()].sort((a, b) => a.localeCompare(b))

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const profileMap = new Map<string, { name: string; email: string }>()
  ;((profiles ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .filter((p) => p.email)
    .forEach((p) => profileMap.set(p.id, { name: p.full_name ?? 'there', email: p.email! }))

  const marker = weeklyDigestMessageMarker(weekKey)
  const { data: alreadySent } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'weekly_digest')
    .like('message', `%${marker}%`)

  const alreadySentSet = new Set(((alreadySent ?? []) as { user_id: string }[]).map((r) => r.user_id))

  const eventById = new Map<
    string,
    {
      id: string
      title: string
      date: string
      slug: string | null
      location: string | null
      venue_id: string | null
      poster_url: string | null
      event_type: string | null
      open_mic_type: string | null
    }
  >()
  ;(
    events as {
      id: string
      title: string
      date: string
      slug: string | null
      location: string | null
      venue_id: string | null
      poster_url: string | null
      event_type: string | null
      open_mic_type: string | null
    }[]
  ).forEach((e) => eventById.set(e.id, e))

  const tmpl = await getEmailTemplate(TEMPLATE_KEYS.WEEKLY_DIGEST)

  const items: WeeklyDigestItem[] = []

  for (const userId of userIds) {
    const profile = profileMap.get(userId)
    if (!profile) continue
    if (alreadySentSet.has(userId)) continue

    const commMap = userCommMap.get(userId)!
    const sections: DigestCommunitySection[] = []

    for (const [communityId, evIds] of commMap) {
      const communityName = communityMap.get(communityId)
      if (!communityName) continue

      const eventsForSection = sortDigestEventsBookedFirst(
        evIds
          .map((id) => eventById.get(id))
          .filter(Boolean)
          .map((ev) => {
            const venue = ev!.venue_id ? (venueMap.get(ev!.venue_id) ?? null) : null
            return {
              id: ev!.id,
              slug: ev!.slug,
              title: ev!.title,
              date: ev!.date,
              venueName: venue?.name ?? null,
              location: ev!.location,
              posterUrl: resolveDigestPosterUrl({
                posterUrl: ev!.poster_url,
                startDate: ev!.date,
                locationText: ev!.location || '',
                venue,
                eventType: ev!.event_type,
                openMicType: ev!.open_mic_type,
                title: ev!.title,
                siteUrl,
              }),
              eventType: ev!.event_type,
            }
          }),
      )

      if (eventsForSection.length === 0) continue
      sections.push({ communityName, communityId, events: eventsForSection })
    }

    if (sections.length === 0) continue
    sections.sort((a, b) => a.communityName.localeCompare(b.communityName))

    items.push({
      userId,
      email: profile.email,
      name: profile.name,
      sections,
    })
  }

  if (items.length === 0) return null

  const batchSize = Number(process.env.WEEKLY_DIGEST_BATCH_SIZE || 100)
  const maxBatches = Number(process.env.WEEKLY_DIGEST_MAX_BATCHES || 5)
  const maxRecipients = batchSize * maxBatches
  const overflowCount = Math.max(0, items.length - maxRecipients)
  const cappedItems = overflowCount > 0 ? items.slice(0, maxRecipients) : items

  return {
    weekKey,
    siteUrl,
    tmpl: { subject: tmpl.subject, intro: tmpl.intro, footer: tmpl.footer },
    items: cappedItems,
    overflowCount,
  }
}

/**
 * Send one batch of digest emails (same weekKey / template).
 */
export async function deliverWeeklyDigestBatch(
  prepared: WeeklyDigestPrepared,
  start: number,
  end: number,
): Promise<DigestResult> {
  const supabase = getAdminSupabase()
  const result: DigestResult = { emailsSent: 0, skipped: 0, errors: [] }
  const marker = weeklyDigestMessageMarker(prepared.weekKey)
  const slice = prepared.items.slice(start, end)

  for (const item of slice) {
    const vars = { user_name: item.name }
    const html = getWeeklyDigestEmail({
      userName: item.name,
      sections: item.sections,
      intro: interpolate(prepared.tmpl.intro, vars),
      footer: interpolate(prepared.tmpl.footer, vars),
      siteUrl: prepared.siteUrl,
    })
    const subject = interpolate(prepared.tmpl.subject, vars)

    const sent = await sendEmail({ to: item.email, subject, html })

    if (sent) {
      await supabase.from('notifications').insert({
        user_id: item.userId,
        type: 'weekly_digest',
        title: subject,
        message: `Weekly digest sent ${marker}`,
      })
      result.emailsSent++
    } else {
      result.errors.push(`Failed to send to ${item.email}`)
    }
  }

  return result
}

/** Full send in one process (no inter-batch delay) — useful for tests or manual runs. */
export async function sendWeeklyDigest(): Promise<DigestResult & { overflowCount?: number }> {
  const prepared = await prepareWeeklyDigest()
  if (!prepared) {
    return { emailsSent: 0, skipped: 0, errors: [] }
  }

  const batchSize = Number(process.env.WEEKLY_DIGEST_BATCH_SIZE || 100)
  let emailsSent = 0
  const errors: string[] = []

  for (let start = 0; start < prepared.items.length; start += batchSize) {
    const end = Math.min(start + batchSize, prepared.items.length)
    const r = await deliverWeeklyDigestBatch(prepared, start, end)
    emailsSent += r.emailsSent
    errors.push(...r.errors)
  }

  return {
    emailsSent,
    skipped: prepared.overflowCount,
    errors,
    overflowCount: prepared.overflowCount,
  }
}

// ── Broadcast path (new) ──────────────────────────────────────────────────────

export type BroadcastDigestResult = {
  broadcastId: string | null
  eventCount: number
  skipped: boolean
  error?: string
}

/**
 * Fetch all upcoming events (next 14 days) as a flat list, sorted by date.
 * Returns null when there is nothing to send.
 */
async function fetchUpcomingEvents(siteUrl: string): Promise<DigestEvent[] | null> {
  const supabase = getAdminSupabase()
  const todayStr = getEasternCalendarDateString(new Date())
  const cutoffStr = addCalendarDaysToYmd(todayStr, 14)

  const { data: rawEvents, error: evErr } = await supabase
    .from('events')
    .select('id, title, date, slug, location, venue_id, poster_url, event_type, open_mic_type')
    .gte('date', todayStr)
    .lte('date', cutoffStr)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')
    .order('date', { ascending: true })

  if (evErr || !rawEvents || rawEvents.length === 0) return null

  const events = (rawEvents as {
    id: string; slug: string | null; venue_id: string | null
    title: string; date: string; location: string | null; poster_url: string | null
    event_type: string | null; open_mic_type: string | null
  }[]).filter((e) => {
    const url = buildEventUrl(e.slug ?? e.id)
    if (!url) console.warn(`[weeklyDigest/broadcast] Skipping event ${e.id}: cannot build URL.`)
    return !!url
  })

  if (events.length === 0) return null

  const venueIds = [...new Set(events.map((e) => e.venue_id).filter(Boolean) as string[])]
  const venueMap = new Map<string, DigestVenue>()
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .from('venues').select('id, name, city').in('id', venueIds)
    ;((venues ?? []) as { id: string; name: string; city: string | null }[]).forEach((v) =>
      venueMap.set(v.id, { name: v.name, city: v.city }),
    )
  }

  return sortDigestEventsBookedFirst(
    events.map((e) => {
      const venue = e.venue_id ? (venueMap.get(e.venue_id) ?? null) : null
      return {
        id: e.id,
        slug: e.slug,
        title: e.title,
        date: e.date,
        venueName: venue?.name ?? null,
        location: e.location,
        posterUrl: resolveDigestPosterUrl({
          posterUrl: e.poster_url,
          startDate: e.date,
          locationText: e.location || '',
          venue,
          eventType: e.event_type,
          openMicType: e.open_mic_type,
          title: e.title,
          siteUrl,
        }),
        eventType: e.event_type,
      }
    }),
  )
}

/**
 * Build and send a single Resend Broadcast for the weekly digest.
 * One call — no per-user loop — bypasses the transactional 100 emails/day cap.
 */
export async function sendBroadcastWeeklyDigest(): Promise<BroadcastDigestResult> {
  const missingConfig = getMissingBroadcastConfig()
  if (missingConfig.length > 0) {
    const error = `Missing required env var(s): ${missingConfig.join(', ')}. Set these in Vercel and redeploy.`
    console.error(`[weeklyDigest/broadcast] Aborting: ${error}`)
    return { broadcastId: null, eventCount: 0, skipped: true, error }
  }

  const siteUrl = getSiteUrl()

  const baseCheck = await validateBaseUrl()
  if (!baseCheck.ok) {
    console.error(
      `[weeklyDigest/broadcast] Aborting: base URL "${siteUrl}" is unreachable. ${baseCheck.reason ?? ''}`,
    )
    return { broadcastId: null, eventCount: 0, skipped: true, error: 'Base URL unreachable' }
  }

  const events = await fetchUpcomingEvents(siteUrl)
  if (!events) {
    console.info('[weeklyDigest/broadcast] No upcoming events — skipping broadcast.')
    return { broadcastId: null, eventCount: 0, skipped: true }
  }

  const tmpl = await getEmailTemplate(TEMPLATE_KEYS.WEEKLY_DIGEST)
  const weekKey = getEasternCalendarDateString(new Date())
  const subject = interpolate(tmpl.subject, { user_name: '{{{FIRST_NAME|there}}}' })

  const html = getBroadcastWeeklyDigestEmail({ events, siteUrl })

  const broadcastId = await sendBroadcast({ subject, html })

  if (!broadcastId) {
    return {
      broadcastId: null,
      eventCount: events.length,
      skipped: false,
      error: 'Broadcast API call failed — check server logs for [resendAudience] sendBroadcast for the specific reason.',
    }
  }

  console.info(`[weeklyDigest/broadcast] Broadcast ${broadcastId} sent (${events.length} events, week ${weekKey}).`)
  return { broadcastId, eventCount: events.length, skipped: false }
}
