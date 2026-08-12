/**
 * Community Command Assistant — shared types, permissions, and host-assignment
 * resolution for the hybrid bulk-assign tool.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getEasternCalendarDateString, EASTERN_TZ } from '@/lib/dateUtils'
import { userCanManageEvent } from '@/lib/server/eventPermissions'

export const COMMUNITY_COMMAND_MANAGE_ROLES = ['admin', 'co_admin', 'event_creator'] as const

export type ManagedCommunity = {
  id: string
  name: string
  role: string
}

export type HostCandidate = {
  id: string
  fullName: string | null
  email: string | null
  score: number
}

export type EventCandidate = {
  id: string
  title: string
  date: string
  location: string | null
  hostUserId: string | null
  hostName: string | null
}

export type AssignmentPreviewStatus = 'ready' | 'ambiguous' | 'unmatched'

export type AssignmentPreviewRow = {
  rowId: string
  dateHint: string
  hostNameHint: string
  eventTitleHint: string | null
  status: AssignmentPreviewStatus
  /** Eastern YYYY-MM-DD when parsed */
  resolvedDate: string | null
  eventId: string | null
  eventTitle: string | null
  eventDate: string | null
  currentHostName: string | null
  proposedHostUserId: string | null
  proposedHostName: string | null
  eventCandidates: EventCandidate[]
  hostCandidates: HostCandidate[]
  notes: string | null
}

export type ExtractedHostAssignment = {
  dateHint: string
  hostNameHint: string
  eventTitleHint?: string | null
}

/** Platform admin or community admin/co_admin/event_creator for ≥1 community. */
export async function userCanAccessCommunityCommands(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as { role?: string } | null)?.role === 'admin') return true

  const { count, error } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .in('role', [...COMMUNITY_COMMAND_MANAGE_ROLES])

  return !error && (count ?? 0) > 0
}

export async function isPlatformAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  if ((profile as { role?: string } | null)?.role === 'admin') return true
  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  return !!adminRow
}

/** Communities the user can run commands against. Platform admins get all active communities. */
export async function listManagedCommunities(
  supabase: SupabaseClient,
  userId: string,
): Promise<ManagedCommunity[]> {
  if (await isPlatformAdmin(supabase, userId)) {
    const { data } = await supabase
      .from('communities')
      .select('id, name')
      .eq('status', 'active')
      .order('name', { ascending: true })
    return ((data ?? []) as { id: string; name: string }[]).map((c) => ({
      id: c.id,
      name: c.name,
      role: 'admin',
    }))
  }

  const { data } = await supabase
    .from('community_members')
    .select('role, communities!inner(id, name, status)')
    .eq('user_id', userId)
    .in('role', [...COMMUNITY_COMMAND_MANAGE_ROLES])

  type Row = {
    role: string
    communities: { id: string; name: string; status: string } | { id: string; name: string; status: string }[] | null
  }

  const out: ManagedCommunity[] = []
  for (const row of (data ?? []) as Row[]) {
    const c = Array.isArray(row.communities) ? row.communities[0] : row.communities
    if (!c || c.status !== 'active') continue
    out.push({ id: c.id, name: c.name, role: row.role })
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

export async function userCanManageCommunity(
  supabase: SupabaseClient,
  userId: string,
  communityId: string,
): Promise<boolean> {
  if (await isPlatformAdmin(supabase, userId)) return true
  const { count, error } = await supabase
    .from('community_members')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('community_id', communityId)
    .in('role', [...COMMUNITY_COMMAND_MANAGE_ROLES])
  return !error && (count ?? 0) > 0
}

/**
 * Parse a free-form date hint into Eastern YYYY-MM-DD.
 * Accepts ISO dates, "Mar 4", "Wed Mar 4", "2026-03-04", etc.
 * Uses the reference year (usually "now") when year is omitted.
 */
export function parseDateHintToEasternYmd(
  dateHint: string,
  referenceDate: Date = new Date(),
): string | null {
  const raw = dateHint.trim()
  if (!raw) return null

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  // Strip leading weekday
  const cleaned = raw.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '').trim()

  const refY = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TZ, year: 'numeric' }).format(referenceDate),
  )

  // Try Date.parse with a year appended if missing
  const hasYear = /\b(20\d{2})\b/.test(cleaned)
  const tryStrings = hasYear
    ? [cleaned, cleaned.replace(/(\d+)(st|nd|rd|th)/gi, '$1')]
    : [
        `${cleaned} ${refY}`,
        `${cleaned.replace(/(\d+)(st|nd|rd|th)/gi, '$1')} ${refY}`,
        `${cleaned} ${refY + 1}`,
      ]

  for (const s of tryStrings) {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) continue
    const ymd = getEasternCalendarDateString(d)
    // If year was omitted and the date already passed this year by >14 days, prefer next year
    if (!hasYear) {
      const todayYmd = getEasternCalendarDateString(referenceDate)
      if (ymd < todayYmd) {
        const next = new Date(s.replace(String(refY), String(refY + 1)))
        if (!Number.isNaN(next.getTime())) return getEasternCalendarDateString(next)
      }
    }
    return ymd
  }

  return null
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function scoreHostMatch(hint: string, fullName: string | null, email: string | null): number {
  const h = normalizeName(hint)
  if (!h) return 0
  const name = normalizeName(fullName || '')
  const mail = normalizeName(email || '')
  const local = mail.split('@')[0] || ''

  if (name && name === h) return 100
  if (local && local === h) return 95
  if (name && name.startsWith(h)) return 85
  if (name && h.startsWith(name) && name.length >= 3) return 80
  if (name && name.includes(h)) return 70
  if (name) {
    const parts = name.split(' ')
    if (parts.some((p) => p === h)) return 90
    if (parts.some((p) => p.startsWith(h) || h.startsWith(p))) return 75
  }
  if (local && local.includes(h)) return 60
  if (mail && mail.includes(h)) return 50
  return 0
}

function scoreTitleMatch(hint: string | null | undefined, title: string): number {
  if (!hint?.trim()) return 0
  const h = normalizeName(hint)
  const t = normalizeName(title)
  if (t === h) return 100
  if (t.includes(h) || h.includes(t)) return 80
  const hWords = h.split(' ').filter((w) => w.length > 2)
  if (hWords.length === 0) return 0
  const hits = hWords.filter((w) => t.includes(w)).length
  return Math.round((hits / hWords.length) * 70)
}

export async function resolveHostAssignments(args: {
  supabase: SupabaseClient
  communityId: string
  extracted: ExtractedHostAssignment[]
}): Promise<AssignmentPreviewRow[]> {
  const { supabase, communityId, extracted } = args

  // Event IDs linked to this community
  const { data: links } = await supabase
    .from('event_communities')
    .select('event_id')
    .eq('community_id', communityId)
    .in('status', ['approved', 'pending'])

  const eventIds = [...new Set(((links ?? []) as { event_id: string }[]).map((l) => l.event_id))]
  if (eventIds.length === 0) {
    return extracted.map((item, i) => ({
      rowId: `row-${i}`,
      dateHint: item.dateHint,
      hostNameHint: item.hostNameHint,
      eventTitleHint: item.eventTitleHint ?? null,
      status: 'unmatched' as const,
      resolvedDate: parseDateHintToEasternYmd(item.dateHint),
      eventId: null,
      eventTitle: null,
      eventDate: null,
      currentHostName: null,
      proposedHostUserId: null,
      proposedHostName: null,
      eventCandidates: [],
      hostCandidates: [],
      notes: 'No events linked to this community.',
    }))
  }

  const todayYmd = getEasternCalendarDateString(new Date())
  // Look back 1 day / forward ~120 days of upcoming events
  const { data: eventRows } = await supabase
    .from('events')
    .select('id, title, date, location, host_user_id, status')
    .in('id', eventIds)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')
    .gte('date', `${todayYmd}T00:00:00-05:00`)
    .order('date', { ascending: true })
    .limit(500)

  type Ev = {
    id: string
    title: string
    date: string
    location: string | null
    host_user_id: string | null
  }
  const events = (eventRows ?? []) as Ev[]

  const hostIds = [...new Set(events.map((e) => e.host_user_id).filter(Boolean))] as string[]
  const hostNameById = new Map<string, string | null>()
  if (hostIds.length > 0) {
    const { data: hosts } = await supabase.from('profiles').select('id, full_name').in('id', hostIds)
    for (const h of (hosts ?? []) as { id: string; full_name: string | null }[]) {
      hostNameById.set(h.id, h.full_name)
    }
  }

  // Community members as host candidates
  const { data: memberRows } = await supabase
    .from('community_members')
    .select('user_id, profiles!inner(id, full_name, email)')
    .eq('community_id', communityId)

  type MemberRow = {
    user_id: string
    profiles:
      | { id: string; full_name: string | null; email: string | null }
      | { id: string; full_name: string | null; email: string | null }[]
      | null
  }

  const members: { id: string; fullName: string | null; email: string | null }[] = []
  for (const row of (memberRows ?? []) as MemberRow[]) {
    const p = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    if (!p) continue
    members.push({ id: p.id, fullName: p.full_name, email: p.email })
  }

  const eventsByYmd = new Map<string, Ev[]>()
  for (const ev of events) {
    const ymd = getEasternCalendarDateString(ev.date)
    const arr = eventsByYmd.get(ymd) ?? []
    arr.push(ev)
    eventsByYmd.set(ymd, arr)
  }

  return extracted.map((item, i) => {
    const resolvedDate = parseDateHintToEasternYmd(item.dateHint)
    const hostScored = members
      .map((m) => ({
        id: m.id,
        fullName: m.fullName,
        email: m.email,
        score: scoreHostMatch(item.hostNameHint, m.fullName, m.email),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)

    let eventCandidates: EventCandidate[] = []
    let notes: string | null = null

    if (!resolvedDate) {
      notes = `Could not parse date "${item.dateHint}".`
    } else {
      const dayEvents = eventsByYmd.get(resolvedDate) ?? []
      if (dayEvents.length === 0) {
        notes = `No upcoming community event on ${resolvedDate}.`
      } else if (item.eventTitleHint?.trim()) {
        const scored = dayEvents
          .map((ev) => ({ ev, score: scoreTitleMatch(item.eventTitleHint, ev.title) }))
          .sort((a, b) => b.score - a.score)
        const best = scored[0]
        if (best && best.score >= 70) {
          const top = scored.filter((s) => s.score >= best.score - 10 && s.score >= 70)
          eventCandidates = top.map(({ ev }) => ({
            id: ev.id,
            title: ev.title,
            date: ev.date,
            location: ev.location,
            hostUserId: ev.host_user_id,
            hostName: ev.host_user_id ? hostNameById.get(ev.host_user_id) ?? null : null,
          }))
        } else {
          eventCandidates = dayEvents.map((ev) => ({
            id: ev.id,
            title: ev.title,
            date: ev.date,
            location: ev.location,
            hostUserId: ev.host_user_id,
            hostName: ev.host_user_id ? hostNameById.get(ev.host_user_id) ?? null : null,
          }))
          notes = `Title hint "${item.eventTitleHint}" did not uniquely match; pick an event.`
        }
      } else {
        eventCandidates = dayEvents.map((ev) => ({
          id: ev.id,
          title: ev.title,
          date: ev.date,
          location: ev.location,
          hostUserId: ev.host_user_id,
          hostName: ev.host_user_id ? hostNameById.get(ev.host_user_id) ?? null : null,
        }))
      }
    }

    const topHost = hostScored[0] ?? null
    const secondHost = hostScored[1] ?? null
    const hostClear = !!topHost && topHost.score >= 75 && (!secondHost || topHost.score - secondHost.score >= 10)

    const topEvent = eventCandidates.length === 1 ? eventCandidates[0] : null
    const eventClear = !!topEvent

    let status: AssignmentPreviewStatus = 'unmatched'
    if (eventClear && hostClear) status = 'ready'
    else if (eventCandidates.length > 0 || hostScored.length > 0) status = 'ambiguous'
    else status = 'unmatched'

    if (!notes) {
      if (!hostClear && hostScored.length === 0) notes = `No community member matched "${item.hostNameHint}".`
      else if (!hostClear && hostScored.length > 1) notes = `Multiple host matches for "${item.hostNameHint}" — pick one.`
      else if (!eventClear && eventCandidates.length > 1) notes = `Multiple events on ${resolvedDate} — pick one.`
    }

    return {
      rowId: `row-${i}`,
      dateHint: item.dateHint,
      hostNameHint: item.hostNameHint,
      eventTitleHint: item.eventTitleHint ?? null,
      status,
      resolvedDate,
      eventId: eventClear ? topEvent!.id : null,
      eventTitle: eventClear ? topEvent!.title : null,
      eventDate: eventClear ? topEvent!.date : null,
      currentHostName: eventClear ? topEvent!.hostName : null,
      proposedHostUserId: hostClear ? topHost!.id : null,
      proposedHostName: hostClear ? topHost!.fullName : null,
      eventCandidates,
      hostCandidates: hostScored,
      notes,
    }
  })
}

/** Apply a single host change with the same phantom-booking guard as change-host. */
export async function applyHostAssignment(
  supabase: SupabaseClient,
  args: {
    eventId: string
    newHostUserId: string
    actorUserId: string
  },
): Promise<{ success: true; newHostName: string | null } | { success: false; error: string }> {
  const { eventId, newHostUserId, actorUserId } = args

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('id, title, created_by, host_user_id')
    .eq('id', eventId)
    .single()

  if (eventError || !event) return { success: false, error: 'Event not found' }

  const canManage = await userCanManageEvent(supabase, eventId, actorUserId, {
    created_by: event.created_by,
    host_user_id: event.host_user_id,
  })
  if (!canManage) return { success: false, error: 'Forbidden for this event' }

  const { data: newHostProfile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', newHostUserId)
    .maybeSingle()

  if (profileError || !newHostProfile) return { success: false, error: 'Host user not found' }

  const previousHostId = event.host_user_id as string | null
  let oldHostHadBookingBefore = false
  if (previousHostId && previousHostId !== newHostUserId) {
    const { count } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('user_id', previousHostId)
      .in('status', ['confirmed', 'waitlist'])
    oldHostHadBookingBefore = (count ?? 0) > 0
  }

  const { error: updateError } = await supabase
    .from('events')
    .update({
      host_user_id: newHostUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId)

  if (updateError) return { success: false, error: updateError.message }

  if (previousHostId && previousHostId !== newHostUserId && !oldHostHadBookingBefore) {
    const { data: phantomBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', previousHostId)
      .in('status', ['confirmed', 'waitlist'])

    if (phantomBookings && phantomBookings.length > 0) {
      await supabase
        .from('bookings')
        .delete()
        .in('id', phantomBookings.map((b: { id: string }) => b.id))
    }
  }

  return { success: true, newHostName: newHostProfile.full_name }
}
