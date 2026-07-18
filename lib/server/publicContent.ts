import { getPublicServerClient } from '@/lib/server/supabasePublic'
import { resolvePublicEventPosterUrl } from '@/lib/eventPosterDefaults'
import type { ProfileRatingAggregates, ProfileReviewSnippet, ProfileReviewSummary, ProfileReviewSnippetRow } from '@/lib/supabase'
import { describeRecurrence } from '@/lib/eventSeriesUtils'

type EventRow = {
  id: string
  slug: string | null
  title: string
  description: string | null
  date: string
  end_time: string | null
  status: string | null
  tickets_enabled: boolean
  external_event: boolean
  external_ticket_url: string | null
  credits_required: number
  audience_deposit_credits?: number | null
  location: string | null
  venue_id: string | null
  host_user_id: string | null
  updated_at: string
  created_at: string
  poster_url: string | null
  event_type: string | null
  open_mic_type: string | null
  series_id?: string | null
}

type VenueRow = {
  id: string
  name: string
  address: string
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
}

type HostRow = {
  full_name: string | null
}

type BookingRow = {
  status: string
  booking_scope: string | null
  event_art_type_id: string | null
  waitlist_position: number | null
  profiles: {
    id: string
    full_name: string | null
    avatar_url: string | null
  } | null
}

type TicketRow = {
  price_cents: number
  quantity: number
  sold: number
}

type ArtTypeRow = {
  id: string
  art_type_name: string
  slot_capacity: number
}

export type PublicEventDetails = {
  id: string
  slug: string | null
  title: string
  description: string
  startDate: string
  endDate: string | null
  status: string
  isCancelled: boolean
  ticketsEnabled: boolean
  isFree: boolean
  ticketUrl: string | null
  ticketPriceCents: number | null
  ticketQuantity: number | null
  ticketSold: number | null
  ticketAvailability: 'InStock' | 'SoldOut'
  /** Credits that can redeem toward / with this ticketed event (stored as audience_deposit_credits). */
  redeemableCredits: number | null
  locationText: string
  venue: {
    name: string
    address: string
    city: string
    region: string
    postalCode: string
    country: string
  } | null
  organizerName: string
  organizerId: string | null
  performerLineup: Array<{
    id: string
    name: string
    avatarUrl: string | null
    status: 'confirmed' | 'waitlist'
    waitlistPosition: number | null
    artTypeId: string | null
    artTypeName: string | null
  }>
  spotsConfirmed: number
  audienceExpectedCount: number
  createdAt: string
  updatedAt: string
  imageUrl: string | null
  eventType: string | null
  openMicType: string | null
  communityName: string | null
  communityId: string | null
  communitySlug: string | null
  seriesId: string | null
  recurrenceDescription: string | null
}

export type PerformerEvent = {
  id: string
  slug: string | null
  title: string
  date: string
  location: string | null
  bookingStatus: string
  waitlistPosition: number | null
}

export type PublicPerformerProfile = {
  id: string
  username: string | null
  fullName: string
  avatarUrl: string | null
  bio: string
  websiteLink: string | null
  instagramLink: string | null
  youtubeLink: string | null
  twitterLink: string | null
  upcomingEvents: PerformerEvent[]
  recentEvents: PerformerEvent[]
  upcomingCount: number
  attendedCount: number
  /** From RPC get_profile_rating_aggregates (public). */
  ratingAggregates: ProfileRatingAggregates | null
  /** From RPC get_profile_recent_review_snippets (public). */
  recentReviewSnippets: ProfileReviewSnippet[]
  /** Direct profile-to-profile review aggregate (avg + count). */
  profileReviewSummary: ProfileReviewSummary
  /** Recent written profile reviews (reviewer name, comment, event context). */
  recentProfileReviews: ProfileReviewSnippetRow[]
}

function parseProfileRatingAggregates(raw: unknown): ProfileRatingAggregates | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const dim = (k: 'performance' | 'hosting' | 'event_creator') => {
    const d = o[k] as Record<string, unknown> | undefined
    if (!d || typeof d !== 'object') return { avg: null as number | null, count: 0 }
    const avg = d.avg
    const count = d.count
    const n =
      typeof avg === 'number' ? avg : avg != null && !Number.isNaN(Number(avg)) ? Number(avg) : null
    return {
      avg: n,
      count: typeof count === 'number' ? count : Number(count) || 0,
    }
  }
  return {
    performance: dim('performance'),
    hosting: dim('hosting'),
    event_creator: dim('event_creator'),
  }
}

function parseProfileReviewSnippets(raw: unknown): ProfileReviewSnippet[] {
  if (!Array.isArray(raw)) return []
  const out: ProfileReviewSnippet[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const x = r as Record<string, unknown>
    if (typeof x.comment !== 'string' || typeof x.eventTitle !== 'string' || x.createdAt == null) continue
    out.push({ comment: x.comment, eventTitle: x.eventTitle, createdAt: String(x.createdAt) })
  }
  return out
}

function inferCityRegionFromLocation(location: string | null): { city: string; region: string } {
  if (!location) return { city: '', region: '' }
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    return { city: parts[parts.length - 2], region: parts[parts.length - 1] }
  }
  return { city: '', region: '' }
}

const EVENT_SELECT =
  'id, slug, title, description, date, end_time, status, tickets_enabled, external_event, external_ticket_url, credits_required, audience_deposit_credits, location, venue_id, host_user_id, created_at, updated_at, poster_url, event_type, open_mic_type, series_id'

/** Ticketed events are never advertised as free just because the ticket row failed to load. */
function computePublicIsFree(ticketsEnabled: boolean, ticket: { price_cents?: number | null } | null): boolean {
  if (!ticketsEnabled) return true
  if (!ticket) return false
  return Number(ticket.price_cents || 0) <= 0
}

type PublicEventVenue = PublicEventDetails['venue']

function resolveEventImageUrl(args: {
  posterUrl: string | null | undefined
  startDate: string
  locationText: string
  venue: PublicEventVenue
  eventType?: string | null
  openMicType?: string | null
  title?: string | null
}): string | null {
  return resolvePublicEventPosterUrl(args)
}

export async function getPublicEventByIdentifier(identifier: string): Promise<PublicEventDetails | null> {
  const supabase = getPublicServerClient()

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier)
  let eventQuery = supabase.from('events').select(EVENT_SELECT)
  eventQuery = isUuid ? eventQuery.eq('id', identifier) : eventQuery.eq('slug', identifier)
  const { data: eventData, error: eventError } = await eventQuery.maybeSingle<EventRow>()
  if (eventError || !eventData) return null

  const [
    venueRes,
    hostRes,
    bookingsRes,
    audienceCountRes,
    ticketRes,
    artTypesRes,
    primaryCommunityRes,
    seriesRes,
  ] = await Promise.all([
    eventData.venue_id
      ? supabase
          .from('venues')
          .select('id, name, address, city, region, postal_code, country')
          .eq('id', eventData.venue_id)
          .maybeSingle<VenueRow>()
      : Promise.resolve({ data: null, error: null }),
    eventData.host_user_id
      ? supabase.from('profiles').select('full_name').eq('id', eventData.host_user_id).maybeSingle<HostRow>()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('bookings')
      .select(
        `
          status,
          booking_scope,
          event_art_type_id,
          waitlist_position,
          profiles (id, full_name, avatar_url)
        `
      )
      .eq('event_id', eventData.id)
      .in('status', ['confirmed', 'waitlist'])
      .order('booked_at', { ascending: true }),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventData.id)
      .eq('booking_scope', 'audience')
      .in('status', ['confirmed', 'waitlist']),
    eventData.tickets_enabled
      ? supabase
          .from('event_tickets')
          .select('price_cents, quantity, sold')
          .eq('event_id', eventData.id)
          .limit(1)
          .maybeSingle<TicketRow>()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('event_art_types')
      .select('id, art_type_name, slot_capacity')
      .eq('event_id', eventData.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('event_communities')
      .select('community_id, communities(id, name, slug)')
      .eq('event_id', eventData.id)
      .eq('is_primary', true)
      .eq('status', 'approved')
      .limit(1)
      .maybeSingle(),
    eventData.series_id
      ? supabase
          .from('event_series')
          .select('recurrence_type, day_of_week, week_of_month, start_time_local')
          .eq('id', eventData.series_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  const inferred = inferCityRegionFromLocation(eventData.location)
  const venue = venueRes.data
    ? {
        name: venueRes.data.name,
        address: venueRes.data.address,
        city: venueRes.data.city || inferred.city,
        region: venueRes.data.region || inferred.region,
        postalCode: venueRes.data.postal_code || '',
        country: venueRes.data.country || '',
      }
    : null

  const artMap = new Map<string, string>()
  ;((artTypesRes.data as ArtTypeRow[] | null) || []).forEach((row) => {
    artMap.set(row.id, row.art_type_name)
  })

  const bookings = (bookingsRes.data as BookingRow[] | null) || []
  const performerLineup = bookings
    .filter((b) => b.booking_scope !== 'audience' && !!b.profiles)
    .map((b) => ({
      id: b.profiles!.id,
      name: b.profiles!.full_name || 'Performer',
      avatarUrl: b.profiles!.avatar_url,
      status: (b.status === 'waitlist' ? 'waitlist' : 'confirmed') as 'confirmed' | 'waitlist',
      waitlistPosition: b.waitlist_position,
      artTypeId: b.event_art_type_id,
      artTypeName: b.event_art_type_id ? artMap.get(b.event_art_type_id) || null : null,
    }))

  const spotsConfirmed = performerLineup.filter((p) => p.status === 'confirmed').length

  const ticket = ticketRes.data || null
  const isFree = computePublicIsFree(!!eventData.tickets_enabled, ticket)
  const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0
  const redeemableCredits = Math.max(0, Number(eventData.audience_deposit_credits || 0))

  const communityRow = (primaryCommunityRes.data as any)?.communities as { id: string; name: string; slug: string | null } | null | undefined

  return {
    id: eventData.id,
    slug: eventData.slug,
    title: eventData.title,
    description: eventData.description || '',
    startDate: eventData.date,
    endDate: eventData.end_time,
    status: eventData.status || 'scheduled',
    isCancelled: (eventData.status || '').toLowerCase() === 'cancelled',
    ticketsEnabled: !!eventData.tickets_enabled,
    isFree,
    ticketUrl: eventData.external_ticket_url,
    ticketPriceCents: ticket ? Number(ticket.price_cents || 0) : null,
    ticketQuantity: ticket ? Number(ticket.quantity || 0) : null,
    ticketSold: ticket ? Number(ticket.sold || 0) : null,
    ticketAvailability: soldOut ? 'SoldOut' : 'InStock',
    redeemableCredits: redeemableCredits > 0 ? redeemableCredits : null,
    locationText: eventData.location || '',
    venue,
    organizerName: hostRes.data?.full_name || 'One Mic Stand',
    organizerId: eventData.host_user_id || null,
    performerLineup,
    spotsConfirmed,
    audienceExpectedCount: audienceCountRes.count || 0,
    createdAt: eventData.created_at,
    updatedAt: eventData.updated_at,
    imageUrl: resolveEventImageUrl({
      posterUrl: eventData.poster_url,
      startDate: eventData.date,
      locationText: eventData.location || '',
      venue,
      eventType: eventData.event_type,
      openMicType: eventData.open_mic_type,
      title: eventData.title,
    }),
    eventType: eventData.event_type || null,
    openMicType: eventData.open_mic_type || null,
    communityName: communityRow?.name || null,
    communityId: communityRow?.id || null,
    communitySlug: communityRow?.slug || null,
    seriesId: eventData.series_id || null,
    recurrenceDescription: seriesRes?.data
      ? describeRecurrence(seriesRes.data as any)
      : null,
  }
}

/**
 * Efficient batch implementation — fetches all events in 5 queries instead of N×7.
 * Replaces the old N+1 pattern that caused timeouts in production.
 */
export type ListPublicEventsOptions = {
  /** When true, only returns events with start date >= now (avoids past events filling the limit). */
  upcomingOnly?: boolean
}

export async function listPublicEvents(
  limit = 100,
  options?: ListPublicEventsOptions,
): Promise<PublicEventDetails[]> {
  const supabase = getPublicServerClient()

  // 1. Fetch events with venue and host joined in one shot
  let eventsQuery = supabase
    .from('events')
    .select(`${EVENT_SELECT}, venues!venue_id(id, name, address, city, region, postal_code, country), profiles!host_user_id(full_name)`)
    .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')
    .order('date', { ascending: true })
    .limit(limit)

  if (options?.upcomingOnly) {
    eventsQuery = eventsQuery.gte('date', new Date().toISOString())
  }

  const { data: events, error: eventsError } = await eventsQuery

  if (eventsError || !events || events.length === 0) return []

  const eventIds = events.map((e: any) => e.id as string)

  // 2. Batch-fetch supporting data for all events in parallel
  const [bookingsRes, ticketsRes, artTypesRes, communityRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('event_id, status, booking_scope, event_art_type_id, waitlist_position, profiles(id, full_name, avatar_url)')
      .in('event_id', eventIds)
      .in('status', ['confirmed', 'waitlist'])
      .order('booked_at', { ascending: true }),
    supabase
      .from('event_tickets')
      .select('event_id, price_cents, quantity, sold')
      .in('event_id', eventIds),
    supabase
      .from('event_art_types')
      .select('id, event_id, art_type_name, slot_capacity')
      .in('event_id', eventIds),
    supabase
      .from('event_communities')
      .select('event_id, communities(id, name, slug)')
      .in('event_id', eventIds)
      .eq('is_primary', true)
      .eq('status', 'approved'),
  ])

  // Index by event_id for O(1) lookup
  const bookingsByEvent = new Map<string, any[]>()
  for (const b of (bookingsRes.data as any[]) || []) {
    const arr = bookingsByEvent.get(b.event_id) || []
    arr.push(b)
    bookingsByEvent.set(b.event_id, arr)
  }

  const ticketByEvent = new Map<string, any>()
  for (const t of (ticketsRes.data as any[]) || []) {
    if (!ticketByEvent.has(t.event_id)) ticketByEvent.set(t.event_id, t)
  }

  const artTypesByEvent = new Map<string, Map<string, string>>()
  for (const at of (artTypesRes.data as any[]) || []) {
    const m = artTypesByEvent.get(at.event_id) || new Map<string, string>()
    m.set(at.id as string, at.art_type_name as string)
    artTypesByEvent.set(at.event_id, m)
  }

  const communityByEvent = new Map<string, { id: string; name: string; slug: string | null }>()
  for (const ec of (communityRes.data as any[]) || []) {
    const comm = ec.communities as { id: string; name: string; slug: string | null } | null
    if (comm) communityByEvent.set(ec.event_id as string, comm)
  }

  // 3. Map events to PublicEventDetails
  return events.map((eventData: any) => {
    const inferred = inferCityRegionFromLocation(eventData.location || null)
    const venueRaw = eventData.venues as any | null
    const venue = venueRaw
      ? {
          name: venueRaw.name as string,
          address: venueRaw.address as string,
          city: (venueRaw.city as string) || inferred.city,
          region: (venueRaw.region as string) || inferred.region,
          postalCode: (venueRaw.postal_code as string) || '',
          country: (venueRaw.country as string) || '',
        }
      : null

    const hostRaw = eventData.profiles as any | null
    const artMap = artTypesByEvent.get(eventData.id) || new Map<string, string>()
    const bookings: BookingRow[] = bookingsByEvent.get(eventData.id) || []

    const performerLineup = bookings
      .filter((b) => b.booking_scope !== 'audience' && !!b.profiles)
      .map((b) => ({
        id: b.profiles!.id,
        name: b.profiles!.full_name || 'Performer',
        avatarUrl: b.profiles!.avatar_url,
        status: (b.status === 'waitlist' ? 'waitlist' : 'confirmed') as 'confirmed' | 'waitlist',
        waitlistPosition: b.waitlist_position,
        artTypeId: b.event_art_type_id,
        artTypeName: b.event_art_type_id ? artMap.get(b.event_art_type_id) || null : null,
      }))

    const spotsConfirmed = performerLineup.filter((p) => p.status === 'confirmed').length
    const audienceExpectedCount = bookings.filter((b) => b.booking_scope === 'audience').length

    const ticket = ticketByEvent.get(eventData.id) || null
    const isFree = computePublicIsFree(!!eventData.tickets_enabled, ticket)
    const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0
    const redeemableCredits = Math.max(0, Number(eventData.audience_deposit_credits || 0))

    const communityRow = communityByEvent.get(eventData.id) || null

    return {
      id: eventData.id as string,
      slug: (eventData.slug as string | null) || null,
      title: eventData.title as string,
      description: (eventData.description as string) || '',
      startDate: eventData.date as string,
      endDate: (eventData.end_time as string | null) || null,
      status: (eventData.status as string) || 'scheduled',
      isCancelled: ((eventData.status as string) || '').toLowerCase() === 'cancelled',
      ticketsEnabled: !!eventData.tickets_enabled,
      isFree,
      ticketUrl: (eventData.external_ticket_url as string | null) || null,
      ticketPriceCents: ticket ? Number(ticket.price_cents || 0) : null,
      ticketQuantity: ticket ? Number(ticket.quantity || 0) : null,
      ticketSold: ticket ? Number(ticket.sold || 0) : null,
      ticketAvailability: soldOut ? 'SoldOut' : 'InStock',
      redeemableCredits: redeemableCredits > 0 ? redeemableCredits : null,
      locationText: (eventData.location as string) || '',
      venue,
      organizerName: hostRaw?.full_name || 'One Mic Stand',
      organizerId: (eventData.host_user_id as string | null) || null,
      performerLineup,
      spotsConfirmed,
      audienceExpectedCount,
      createdAt: eventData.created_at as string,
      updatedAt: eventData.updated_at as string,
      imageUrl: resolveEventImageUrl({
        posterUrl: eventData.poster_url as string | null,
        startDate: eventData.date as string,
        locationText: (eventData.location as string) || '',
        venue,
        eventType: eventData.event_type as string | null,
        openMicType: eventData.open_mic_type as string | null,
        title: eventData.title as string,
      }),
      eventType: (eventData.event_type as string | null) || null,
      openMicType: (eventData.open_mic_type as string | null) || null,
      communityName: communityRow?.name || null,
      communityId: communityRow?.id || null,
      communitySlug: communityRow?.slug || null,
      seriesId: (eventData.series_id as string | null) || null,
      recurrenceDescription: null, // loaded on detail page only
    } satisfies PublicEventDetails
  })
}

/**
 * Batch-fetch full PublicEventDetails for an explicit list of event IDs.
 * Uses the same 5-query batch approach as listPublicEvents — safe for any count.
 */
export async function fetchEventsByIds(eventIds: string[]): Promise<PublicEventDetails[]> {
  if (eventIds.length === 0) return []
  const supabase = getPublicServerClient()

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select(`${EVENT_SELECT}, venues!venue_id(id, name, address, city, region, postal_code, country), profiles!host_user_id(full_name)`)
    .in('id', eventIds)

  if (eventsError || !events || events.length === 0) return []

  const [bookingsRes, ticketsRes, artTypesRes, communityRes] = await Promise.all([
    supabase
      .from('bookings')
      .select('event_id, status, booking_scope, event_art_type_id, waitlist_position, profiles(id, full_name, avatar_url)')
      .in('event_id', eventIds)
      .in('status', ['confirmed', 'waitlist'])
      .order('booked_at', { ascending: true }),
    supabase.from('event_tickets').select('event_id, price_cents, quantity, sold').in('event_id', eventIds),
    supabase.from('event_art_types').select('id, event_id, art_type_name').in('event_id', eventIds),
    supabase
      .from('event_communities')
      .select('event_id, communities(id, name, slug)')
      .in('event_id', eventIds)
      .eq('is_primary', true)
      .eq('status', 'approved'),
  ])

  const bookingsByEvent = new Map<string, any[]>()
  for (const b of (bookingsRes.data as any[]) || []) {
    const arr = bookingsByEvent.get(b.event_id) || []
    arr.push(b); bookingsByEvent.set(b.event_id, arr)
  }
  const ticketByEvent = new Map<string, any>()
  for (const t of (ticketsRes.data as any[]) || []) {
    if (!ticketByEvent.has(t.event_id)) ticketByEvent.set(t.event_id, t)
  }
  const artTypesByEvent = new Map<string, Map<string, string>>()
  for (const at of (artTypesRes.data as any[]) || []) {
    const m = artTypesByEvent.get(at.event_id) || new Map<string, string>()
    m.set(at.id as string, at.art_type_name as string); artTypesByEvent.set(at.event_id, m)
  }
  const communityByEvent = new Map<string, { id: string; name: string; slug: string | null }>()
  for (const ec of (communityRes.data as any[]) || []) {
    const comm = ec.communities as { id: string; name: string; slug: string | null } | null
    if (comm) communityByEvent.set(ec.event_id as string, comm)
  }

  return events.map((eventData: any) => {
    const inferred = inferCityRegionFromLocation(eventData.location || null)
    const venueRaw = eventData.venues as any | null
    const venue = venueRaw
      ? {
          name: venueRaw.name as string, address: venueRaw.address as string,
          city: (venueRaw.city as string) || inferred.city, region: (venueRaw.region as string) || inferred.region,
          postalCode: (venueRaw.postal_code as string) || '', country: (venueRaw.country as string) || '',
        }
      : null
    const hostRaw = eventData.profiles as any | null
    const artMap = artTypesByEvent.get(eventData.id) || new Map<string, string>()
    const bookings: BookingRow[] = bookingsByEvent.get(eventData.id) || []
    const performerLineup = bookings
      .filter((b) => b.booking_scope !== 'audience' && !!b.profiles)
      .map((b) => ({
        id: b.profiles!.id, name: b.profiles!.full_name || 'Performer', avatarUrl: b.profiles!.avatar_url,
        status: (b.status === 'waitlist' ? 'waitlist' : 'confirmed') as 'confirmed' | 'waitlist',
        waitlistPosition: b.waitlist_position, artTypeId: b.event_art_type_id,
        artTypeName: b.event_art_type_id ? artMap.get(b.event_art_type_id) || null : null,
      }))
    const spotsConfirmed = performerLineup.filter((p) => p.status === 'confirmed').length
    const ticket = ticketByEvent.get(eventData.id) || null
    const isFree = computePublicIsFree(!!eventData.tickets_enabled, ticket)
    const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0
    const redeemableCredits = Math.max(0, Number(eventData.audience_deposit_credits || 0))
    const communityRow = communityByEvent.get(eventData.id) || null
    return {
      id: eventData.id as string, slug: (eventData.slug as string | null) || null,
      title: eventData.title as string, description: (eventData.description as string) || '',
      startDate: eventData.date as string, endDate: (eventData.end_time as string | null) || null,
      status: (eventData.status as string) || 'scheduled',
      isCancelled: ((eventData.status as string) || '').toLowerCase() === 'cancelled',
      ticketsEnabled: !!eventData.tickets_enabled, isFree,
      ticketUrl: (eventData.external_ticket_url as string | null) || null,
      ticketPriceCents: ticket ? Number(ticket.price_cents || 0) : null,
      ticketQuantity: ticket ? Number(ticket.quantity || 0) : null,
      ticketSold: ticket ? Number(ticket.sold || 0) : null,
      ticketAvailability: (soldOut ? 'SoldOut' : 'InStock') as 'InStock' | 'SoldOut',
      redeemableCredits: redeemableCredits > 0 ? redeemableCredits : null,
      locationText: (eventData.location as string) || '', venue,
      organizerName: hostRaw?.full_name || 'One Mic Stand',
      organizerId: (eventData.host_user_id as string | null) || null,
      performerLineup, spotsConfirmed,
      audienceExpectedCount: bookings.filter((b) => b.booking_scope === 'audience').length,
      createdAt: eventData.created_at as string, updatedAt: eventData.updated_at as string,
      imageUrl: resolveEventImageUrl({
        posterUrl: eventData.poster_url as string | null,
        startDate: eventData.date as string,
        locationText: (eventData.location as string) || '',
        venue,
        eventType: eventData.event_type as string | null,
        openMicType: eventData.open_mic_type as string | null,
        title: eventData.title as string,
      }),
      eventType: (eventData.event_type as string | null) || null,
      openMicType: (eventData.open_mic_type as string | null) || null,
      communityName: communityRow?.name || null, communityId: communityRow?.id || null,
      communitySlug: communityRow?.slug || null,
      seriesId: (eventData.series_id as string | null) || null,
      recurrenceDescription: null,
    } satisfies PublicEventDetails
  })
}

export async function listPublicPerformerProfiles(limit = 500) {
  const supabase = getPublicServerClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, updated_at, role')
    .in('role', ['performer', 'event_creator'])
    .not('full_name', 'is', null)
    .limit(limit)

  return (data || []).map((row: any) => ({
    id: row.id as string,
    fullName: row.full_name as string,
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  }))
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Resolves a profile by UUID or username, then fetches full public details.
 * If `identifier` looks like a UUID it is matched against `profiles.id`;
 * otherwise it is matched against `profiles.username` (case-insensitive).
 */
export async function getPublicPerformerProfile(identifier: string): Promise<PublicPerformerProfile | null> {
  const supabase = getPublicServerClient()

  const isUuid = UUID_RE.test(identifier)
  const profileQuery = supabase
    .from('profiles')
    .select('id, username, full_name, avatar_url, bio, website_link, instagram_link, youtube_link, twitter_link')

  const { data: profileData } = isUuid
    ? await profileQuery.eq('id', identifier).maybeSingle()
    : await profileQuery.ilike('username', identifier).maybeSingle()

  if (!profileData) return null

  const profileId = String(profileData.id)
  const now = new Date().toISOString()

  const [bookingsRes, attendedRes, aggRes, snipRes, prSummaryRes, prSnipsRes] = await Promise.all([
    // All confirmed/waitlist bookings – we split into upcoming/recent client-side
    supabase
      .from('bookings')
      .select(
        `
        status,
        waitlist_position,
        events (
          id,
          slug,
          title,
          date,
          location,
          status
        )
      `
      )
      .eq('user_id', profileId)
      .in('status', ['confirmed', 'waitlist'])
      .order('booked_at', { ascending: false }),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId)
      .eq('attendance_status', 'attended'),
    supabase.rpc('get_profile_rating_aggregates', { p_profile_id: profileId }),
    supabase.rpc('get_profile_recent_review_snippets', { p_profile_id: profileId, p_limit: 5 }),
    supabase.rpc('get_profile_review_summary', { p_ratee_id: profileId }),
    supabase.rpc('get_profile_recent_written_reviews', { p_ratee_id: profileId, p_limit: 5 }),
  ])

  const allBookings = ((bookingsRes.data as any[]) || []).filter(
    (row) => row.events && row.events.status !== 'cancelled',
  )

  const mapEvent = (row: any): PerformerEvent => ({
    id: row.events.id as string,
    slug: row.events.slug ? String(row.events.slug) : null,
    title: String(row.events.title || 'Event'),
    date: String(row.events.date),
    location: row.events.location ? String(row.events.location) : null,
    bookingStatus: String(row.status || 'confirmed'),
    waitlistPosition: row.waitlist_position ?? null,
  })

  const upcomingEvents = allBookings
    .filter((row) => new Date(row.events.date) > new Date(now))
    .reverse()       // ascending for upcoming
    .map(mapEvent)

  // Past events: descending by date, limit 3, confirmed attendance only
  const recentEvents = allBookings
    .filter((row) => new Date(row.events.date) <= new Date(now) && row.status === 'confirmed')
    .slice(0, 3)
    .map(mapEvent)

  const ratingAggregates =
    aggRes.error || aggRes.data == null ? null : parseProfileRatingAggregates(aggRes.data)
  const recentReviewSnippets =
    snipRes.error || snipRes.data == null ? [] : parseProfileReviewSnippets(snipRes.data)

  const rawSummary = prSummaryRes.data as { avg: number | null; count: number } | null
  const profileReviewSummary: ProfileReviewSummary = {
    avg: rawSummary?.avg ?? null,
    count: rawSummary?.count ?? 0,
  }

  const recentProfileReviews: ProfileReviewSnippetRow[] = Array.isArray(prSnipsRes.data)
    ? (prSnipsRes.data as ProfileReviewSnippetRow[])
    : []

  return {
    id: profileId,
    username: (profileData as any).username ?? null,
    fullName: profileData.full_name || 'Performer',
    avatarUrl: profileData.avatar_url || null,
    bio: profileData.bio || '',
    websiteLink: profileData.website_link || null,
    instagramLink: profileData.instagram_link || null,
    youtubeLink: profileData.youtube_link || null,
    twitterLink: profileData.twitter_link || null,
    upcomingEvents,
    recentEvents,
    upcomingCount: upcomingEvents.length,
    attendedCount: attendedRes.count || 0,
    ratingAggregates,
    recentReviewSnippets,
    profileReviewSummary,
    recentProfileReviews,
  }
}
