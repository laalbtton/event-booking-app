/**
 * Community Command Assistant — shared types, permissions, and host-assignment
 * resolution for the hybrid bulk-assign tool.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getEasternCalendarDateString,
  EASTERN_TZ,
  addCalendarDaysToYmd,
} from '@/lib/dateUtils'
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
  cityLabel: string | null
}

export type AssignmentPreviewStatus = 'ready' | 'ambiguous' | 'unmatched'

/** City / mic region mentioned in the prompt (exact filter when present). */
export type LocationHint = 'brampton' | 'toronto'

export type AssignmentPreviewRow = {
  rowId: string
  dateHint: string
  hostNameHint: string
  eventTitleHint: string | null
  locationHint: LocationHint | null
  status: AssignmentPreviewStatus
  /** Eastern YYYY-MM-DD when parsed — exact calendar date from the prompt */
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
  locationHint?: LocationHint | null
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
 *
 * IMPORTANT: builds the calendar date from month/day/year components directly.
 * Never uses `new Date("Mar 4")` — that parses as UTC midnight and shifts the
 * Eastern calendar day (e.g. Mar 4 → Mar 3 EST).
 *
 * When a weekday is present ("Wed Mar 4"), the month/day must land on that
 * weekday for the chosen year when possible.
 */
export function parseDateHintToEasternYmd(
  dateHint: string,
  referenceDate: Date = new Date(),
): string | null {
  const raw = dateHint.trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const weekdayMatch = raw.match(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*/i)
  const wantedWeekday = weekdayMatch ? weekdayTokenToIndex(weekdayMatch[1]) : null

  const cleaned = raw
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+/i, '')
    .replace(/(\d+)(st|nd|rd|th)/gi, '$1')
    .trim()

  const refY = Number(
    new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TZ, year: 'numeric' }).format(referenceDate),
  )
  const todayYmd = getEasternCalendarDateString(referenceDate)

  // 2026/03/04 or 03/04/2026 or 3/4
  const slash = cleaned.match(/^(\d{1,4})[\/\-.](\d{1,2})(?:[\/\-.](\d{1,4}))?$/)
  if (slash) {
    let y: number
    let m: number
    let d: number
    let yearOmitted = false
    if (slash[3] && slash[1].length === 4) {
      y = Number(slash[1])
      m = Number(slash[2])
      d = Number(slash[3])
    } else if (slash[3] && slash[3].length === 4) {
      m = Number(slash[1])
      d = Number(slash[2])
      y = Number(slash[3])
    } else {
      m = Number(slash[1])
      d = Number(slash[2])
      y = refY
      yearOmitted = true
    }
    return pickValidYmd(y, m, d, wantedWeekday, todayYmd, yearOmitted)
  }

  // "Mar 4", "March 4 2026", "4 Mar", "4 March 2026"
  const monthName = cleaned.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i,
  )
  const dayMatch = cleaned.match(/\b(\d{1,2})\b/)
  const yearMatch = cleaned.match(/\b(20\d{2})\b/)

  if (monthName && dayMatch) {
    const m = monthTokenToNumber(monthName[1])
    const d = Number(dayMatch[1])
    if (!m || !d) return null
    const hasYear = !!yearMatch
    const y = hasYear ? Number(yearMatch![1]) : refY
    return pickValidYmd(y, m, d, wantedWeekday, todayYmd, !hasYear)
  }

  return null
}

function weekdayTokenToIndex(token: string): number {
  const t = token.toLowerCase().slice(0, 3)
  const map: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
  return map[t] ?? -1
}

function monthTokenToNumber(token: string): number | null {
  const t = token.toLowerCase().slice(0, 3)
  const map: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  }
  return map[t] ?? null
}

function ymdParts(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Weekday of a YYYY-MM-DD civil date (noon UTC — unambiguous for the Y-M-D triple). */
function weekdayIndexOfYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay()
}

function pickValidYmd(
  year: number,
  month: number,
  day: number,
  wantedWeekday: number | null,
  todayYmd: string,
  yearWasOmitted: boolean,
): string | null {
  const candidates: string[] = []
  const primary = ymdParts(year, month, day)
  if (primary) candidates.push(primary)
  if (yearWasOmitted) {
    const next = ymdParts(year + 1, month, day)
    if (next) candidates.push(next)
    const prev = ymdParts(year - 1, month, day)
    if (prev) candidates.push(prev)
  }

  const weekdayOk = (ymd: string) =>
    wantedWeekday == null || wantedWeekday < 0 || weekdayIndexOfYmd(ymd) === wantedWeekday

  const ranked = candidates
    .filter(weekdayOk)
    .sort((a, b) => {
      const aFuture = a >= todayYmd ? 0 : 1
      const bFuture = b >= todayYmd ? 0 : 1
      if (aFuture !== bFuture) return aFuture - bFuture
      return a.localeCompare(b)
    })

  if (ranked.length > 0) return ranked[0]

  // Fall back to calendar month/day even if weekday mismatched
  if (primary && (!yearWasOmitted || primary >= todayYmd)) return primary
  if (yearWasOmitted) {
    const next = ymdParts(year + 1, month, day)
    if (next) return next
  }
  return primary
}

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function normalizeLocationHint(raw: string | null | undefined): LocationHint | null {
  if (!raw?.trim()) return null
  const s = normalizeName(raw)
  if (s.includes('brampton') || s === 'b ton' || s === 'b-town') return 'brampton'
  if (s.includes('toronto') || s === 'to' || s === 'the 6') return 'toronto'
  // Venue aliases commonly used instead of city names
  if (s.includes('ryan') && s.includes('chai')) return 'brampton'
  if (s.includes('socap') || s.includes('so cap') || s.includes('station on bloor')) return 'toronto'
  return null
}

function eventSearchBlob(ev: {
  title: string
  location: string | null
  venueName: string | null
  venueCity: string | null
}): string {
  return normalizeName([ev.title, ev.location || '', ev.venueName || '', ev.venueCity || ''].join(' '))
}

/**
 * Infer Brampton vs Toronto from venue/location/title.
 * Ryan's Chai → Brampton; SoCap / Station on Bloor → Toronto.
 */
export function inferEventLocationLabel(ev: {
  title: string
  location: string | null
  venueName: string | null
  venueCity: string | null
}): LocationHint | null {
  const blob = eventSearchBlob(ev)
  const city = normalizeName(ev.venueCity || '')

  if (city.includes('brampton') || blob.includes('brampton')) return 'brampton'
  if (city.includes('toronto') || blob.includes('toronto')) return 'toronto'

  if (
    (blob.includes('ryan') && blob.includes('chai')) ||
    blob.includes("ryan's chai") ||
    blob.includes('ryans chai')
  ) {
    return 'brampton'
  }
  if (blob.includes('socap') || blob.includes('so cap') || blob.includes('station on bloor')) {
    return 'toronto'
  }

  return null
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

function scoreTitleMatch(hint: string | null | undefined, title: string, locationBlob: string): number {
  if (!hint?.trim()) return 0
  const h = normalizeName(hint)
  const t = normalizeName(title)
  const blob = normalizeName(`${title} ${locationBlob}`)
  if (t === h) return 100
  if (t.includes(h) || h.includes(t)) return 80
  if (blob.includes(h)) return 75
  const hWords = h.split(' ').filter((w) => w.length > 2)
  if (hWords.length === 0) return 0
  const hits = hWords.filter((w) => blob.includes(w)).length
  return Math.round((hits / hWords.length) * 70)
}

function toCandidate(
  ev: {
    id: string
    title: string
    date: string
    location: string | null
    host_user_id: string | null
    venueName: string | null
    venueCity: string | null
  },
  hostNameById: Map<string, string | null>,
): EventCandidate {
  const cityLabel = inferEventLocationLabel(ev)
  return {
    id: ev.id,
    title: ev.title,
    date: ev.date,
    location: ev.location,
    hostUserId: ev.host_user_id,
    hostName: ev.host_user_id ? hostNameById.get(ev.host_user_id) ?? null : null,
    cityLabel: cityLabel ? cityLabel[0].toUpperCase() + cityLabel.slice(1) : ev.venueCity,
  }
}

export async function resolveHostAssignments(args: {
  supabase: SupabaseClient
  communityId: string
  extracted: ExtractedHostAssignment[]
}): Promise<AssignmentPreviewRow[]> {
  const { supabase, communityId, extracted } = args

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
      locationHint: item.locationHint ?? null,
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
  // Wide SQL window; exact Eastern calendar day is matched in memory.
  const rangeStartYmd = addCalendarDaysToYmd(todayYmd, -3)
  const rangeEndYmd = addCalendarDaysToYmd(todayYmd, 180)

  const { data: eventRows } = await supabase
    .from('events')
    .select('id, title, date, location, host_user_id, status, venue_id, venues(name, city)')
    .in('id', eventIds)
    .not('status', 'in', '("cancelled","archived","draft")')
    .gte('date', `${rangeStartYmd}T00:00:00.000Z`)
    .lte('date', `${rangeEndYmd}T23:59:59.999Z`)
    .order('date', { ascending: true })
    .limit(800)

  type Ev = {
    id: string
    title: string
    date: string
    location: string | null
    host_user_id: string | null
    venueName: string | null
    venueCity: string | null
    easternYmd: string
  }

  const events: Ev[] = []
  for (const row of (eventRows ?? []) as Array<{
    id: string
    title: string
    date: string
    location: string | null
    host_user_id: string | null
    venues: { name: string; city: string | null } | { name: string; city: string | null }[] | null
  }>) {
    const venue = Array.isArray(row.venues) ? row.venues[0] : row.venues
    const easternYmd = getEasternCalendarDateString(row.date)
    if (easternYmd < rangeStartYmd || easternYmd > rangeEndYmd) continue
    events.push({
      id: row.id,
      title: row.title,
      date: row.date,
      location: row.location,
      host_user_id: row.host_user_id,
      venueName: venue?.name ?? null,
      venueCity: venue?.city ?? null,
      easternYmd,
    })
  }

  const hostIds = [...new Set(events.map((e) => e.host_user_id).filter(Boolean))] as string[]
  const hostNameById = new Map<string, string | null>()
  if (hostIds.length > 0) {
    const { data: hosts } = await supabase.from('profiles').select('id, full_name').in('id', hostIds)
    for (const h of (hosts ?? []) as { id: string; full_name: string | null }[]) {
      hostNameById.set(h.id, h.full_name)
    }
  }

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
    const arr = eventsByYmd.get(ev.easternYmd) ?? []
    arr.push(ev)
    eventsByYmd.set(ev.easternYmd, arr)
  }

  return extracted.map((item, i) => {
    const locationHint = item.locationHint ?? null
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
      notes = `Could not parse date "${item.dateHint}" into an exact calendar day.`
    } else {
      const dayEvents = eventsByYmd.get(resolvedDate) ?? []

      if (dayEvents.length === 0) {
        const near = [addCalendarDaysToYmd(resolvedDate, -1), addCalendarDaysToYmd(resolvedDate, 1)]
          .flatMap((ymd) => (eventsByYmd.get(ymd) ?? []).map((e) => `${e.title} (${ymd})`))
          .slice(0, 3)
        notes =
          near.length > 0
            ? `No community event on exact date ${resolvedDate} (from "${item.dateHint}"). Nearby: ${near.join('; ')}.`
            : `No community event on exact date ${resolvedDate} (from "${item.dateHint}").`
      } else {
        let filtered = dayEvents

        if (locationHint) {
          const byLocation = dayEvents.filter((ev) => inferEventLocationLabel(ev) === locationHint)
          if (byLocation.length > 0) {
            filtered = byLocation
          } else {
            notes = `No ${locationHint[0].toUpperCase()}${locationHint.slice(1)} event on ${resolvedDate}; showing all events that day — pick one.`
          }
        }

        if (item.eventTitleHint?.trim()) {
          const scored = filtered
            .map((ev) => ({
              ev,
              score: scoreTitleMatch(
                item.eventTitleHint,
                ev.title,
                `${ev.location || ''} ${ev.venueName || ''} ${ev.venueCity || ''}`,
              ),
            }))
            .sort((a, b) => b.score - a.score)
          const best = scored[0]
          if (best && best.score >= 70) {
            const top = scored.filter((s) => s.score >= best.score - 10 && s.score >= 70)
            eventCandidates = top.map(({ ev }) => toCandidate(ev, hostNameById))
          } else {
            eventCandidates = filtered.map((ev) => toCandidate(ev, hostNameById))
            notes =
              notes ||
              `Title hint "${item.eventTitleHint}" did not uniquely match; pick an event.`
          }
        } else {
          eventCandidates = filtered.map((ev) => toCandidate(ev, hostNameById))
        }
      }
    }

    const topHost = hostScored[0] ?? null
    const secondHost = hostScored[1] ?? null
    const hostClear =
      !!topHost && topHost.score >= 75 && (!secondHost || topHost.score - secondHost.score >= 10)

    const topEvent = eventCandidates.length === 1 ? eventCandidates[0] : null
    const eventClear = !!topEvent

    let status: AssignmentPreviewStatus = 'unmatched'
    if (eventClear && hostClear) status = 'ready'
    else if (eventCandidates.length > 0 || hostScored.length > 0) status = 'ambiguous'
    else status = 'unmatched'

    if (!notes) {
      if (!hostClear && hostScored.length === 0) notes = `No community member matched "${item.hostNameHint}".`
      else if (!hostClear && hostScored.length > 1)
        notes = `Multiple host matches for "${item.hostNameHint}" — pick one.`
      else if (!eventClear && eventCandidates.length > 1)
        notes = `Multiple events on ${resolvedDate}${locationHint ? ` (${locationHint})` : ''} — pick one.`
    }

    return {
      rowId: `row-${i}`,
      dateHint: item.dateHint,
      hostNameHint: item.hostNameHint,
      eventTitleHint: item.eventTitleHint ?? null,
      locationHint,
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
