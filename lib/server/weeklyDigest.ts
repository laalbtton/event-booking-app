/**
 * Weekly community digest sender.
 *
 * Every Sunday morning Inngest wakes up the weeklyDigest function which calls
 * sendWeeklyDigest() below.
 *
 * What it does:
 *   1. Finds all events in the next 14 days that belong to at least one
 *      approved community.
 *   2. Builds a map of user_id → community → events.
 *   3. For each user who has at least one relevant event, sends a single
 *      digest email with sections grouped by community.
 *   4. Skips users who already received this week's digest (deduplication).
 */

import { createClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/email'
import { getWeeklyDigestEmail, type DigestCommunitySection } from '@/lib/email'
import { getEmailTemplate, interpolate, TEMPLATE_KEYS } from '@/lib/server/emailTemplates'
import { formatDateTime } from '@/lib/dateUtils'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

function getSiteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || 'https://laalbutton.com'
}

export type DigestResult = {
  emailsSent: number
  skipped: number
  errors: string[]
}

export async function sendWeeklyDigest(): Promise<DigestResult> {
  const supabase = getAdminSupabase()
  const siteUrl = getSiteUrl()
  const result: DigestResult = { emailsSent: 0, skipped: 0, errors: [] }

  // ── 1. Date window: today → +14 days ──────────────────────────────────────
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
  const todayStr = today.toISOString().split('T')[0]
  const cutoffStr = cutoff.toISOString().split('T')[0]

  // ── 2. Fetch upcoming events (including poster_url for card images) ─────────
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, title, date, slug, location, venue_id, poster_url')
    .gte('date', todayStr)
    .lte('date', cutoffStr)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')
    .order('date', { ascending: true })

  if (evErr || !events || events.length === 0) {
    return result // nothing to send
  }

  const eventIds = (events as { id: string }[]).map((e) => e.id)
  const venueIds = [
    ...new Set(
      (events as { venue_id: string | null }[]).map((e) => e.venue_id).filter(Boolean) as string[],
    ),
  ]

  // ── 3. Fetch venue names ──────────────────────────────────────────────────
  const venueMap = new Map<string, string>()
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name')
      .in('id', venueIds)
    ;(venues as { id: string; name: string }[] | null ?? []).forEach((v) =>
      venueMap.set(v.id, v.name),
    )
  }

  // ── 4. Fetch approved event→community links (primary links first) ──────────
  const { data: links, error: linkErr } = await supabase
    .from('event_communities')
    .select('event_id, community_id, is_primary')
    .in('event_id', eventIds)
    .eq('status', 'approved')
    .order('is_primary', { ascending: false }) // primary rows come first

  if (linkErr || !links || links.length === 0) {
    return result
  }

  // Each event is assigned to exactly ONE community for the digest email.
  // Priority: the row where is_primary = true; otherwise the first approved link.
  const eventAssignedComm = new Map<string, string>() // event_id → community_id
  ;(links as { event_id: string; community_id: string; is_primary: boolean }[])
    .forEach(({ event_id, community_id, is_primary }) => {
      if (!eventAssignedComm.has(event_id) || is_primary) {
        eventAssignedComm.set(event_id, community_id)
      }
    })

  // community_id → event IDs (deduplicated — each event in one community only)
  const commToEvents = new Map<string, string[]>()
  for (const [event_id, community_id] of eventAssignedComm) {
    const arr = commToEvents.get(community_id) ?? []
    arr.push(event_id)
    commToEvents.set(community_id, arr)
  }

  const communityIds = [...commToEvents.keys()]

  // ── 5. Fetch community names ──────────────────────────────────────────────
  const { data: communities } = await supabase
    .from('communities')
    .select('id, name')
    .in('id', communityIds)
    .eq('status', 'active')

  const communityMap = new Map<string, string>()
  ;(communities as { id: string; name: string }[] | null ?? []).forEach((c) =>
    communityMap.set(c.id, c.name),
  )

  // ── 6. Fetch all members of those communities ─────────────────────────────
  const { data: members, error: memberErr } = await supabase
    .from('community_members')
    .select('user_id, community_id')
    .in('community_id', communityIds)

  if (memberErr || !members || members.length === 0) {
    return result
  }

  // ── 7. Build user → {community → events} map ─────────────────────────────
  // user_id → Map<community_id, event_ids[]>
  const userCommMap = new Map<string, Map<string, string[]>>()
  ;(members as { user_id: string; community_id: string }[]).forEach(({ user_id, community_id }) => {
    const evIds = commToEvents.get(community_id)
    if (!evIds || evIds.length === 0) return
    const commMap = userCommMap.get(user_id) ?? new Map<string, string[]>()
    commMap.set(community_id, evIds)
    userCommMap.set(user_id, commMap)
  })

  if (userCommMap.size === 0) return result

  const userIds = [...userCommMap.keys()]

  // ── 8. Fetch user profiles (name + email) ────────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const profileMap = new Map<string, { name: string; email: string }>()
  ;(profiles as { id: string; full_name: string | null; email: string | null }[] | null ?? [])
    .filter((p) => p.email)
    .forEach((p) => profileMap.set(p.id, { name: p.full_name ?? 'there', email: p.email! }))

  // ── 9. Deduplication: find users who already got a digest this week ───────
  const weekStart = todayStr // use today's date as the week key
  const { data: alreadySent } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('type', 'weekly_digest')
    .gte('created_at', today.toISOString())

  const alreadySentSet = new Set(
    (alreadySent as { user_id: string }[] | null ?? []).map((r) => r.user_id),
  )

  // Build event lookup map
  const eventById = new Map<
    string,
    {
      id: string; title: string; date: string; slug: string | null
      location: string | null; venue_id: string | null; poster_url: string | null
    }
  >()
  ;(
    events as {
      id: string; title: string; date: string; slug: string | null
      location: string | null; venue_id: string | null; poster_url: string | null
    }[]
  ).forEach((e) => eventById.set(e.id, e))

  // ── 10. Load template ─────────────────────────────────────────────────────
  const tmpl = await getEmailTemplate(TEMPLATE_KEYS.WEEKLY_DIGEST)

  // ── 11. Send one email per user ───────────────────────────────────────────
  for (const [userId, commMap] of userCommMap) {
    const profile = profileMap.get(userId)
    if (!profile) { result.skipped++; continue }

    if (alreadySentSet.has(userId)) { result.skipped++; continue }

    const vars = { user_name: profile.name }

    // Build sections for this user
    const sections: DigestCommunitySection[] = []
    for (const [communityId, evIds] of commMap) {
      const communityName = communityMap.get(communityId)
      if (!communityName) continue

      const eventsForSection = evIds
        .map((id) => eventById.get(id))
        .filter(Boolean)
        .map((ev) => ({
          id: ev!.id,
          slug: ev!.slug,
          title: ev!.title,
          date: ev!.date,
          venueName: ev!.venue_id ? (venueMap.get(ev!.venue_id) ?? null) : null,
          location: ev!.location,
          posterUrl: ev!.poster_url ?? null,
        }))

      if (eventsForSection.length === 0) continue
      sections.push({ communityName, communityId, events: eventsForSection })
    }

    if (sections.length === 0) { result.skipped++; continue }

    // Sort sections alphabetically
    sections.sort((a, b) => a.communityName.localeCompare(b.communityName))

    const html = getWeeklyDigestEmail({
      userName: profile.name,
      sections,
      intro: interpolate(tmpl.intro, vars),
      footer: interpolate(tmpl.footer, vars),
      siteUrl,
    })

    const subject = interpolate(tmpl.subject, vars)

    const sent = await sendEmail({ to: profile.email, subject, html })

    if (sent) {
      // Record in notifications for deduplication + audit
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'weekly_digest',
        title: subject,
        message: `Weekly digest sent for week starting ${weekStart}`,
      })
      result.emailsSent++
    } else {
      result.errors.push(`Failed to send to ${profile.email}`)
    }
  }

  return result
}
