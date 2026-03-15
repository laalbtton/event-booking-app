import { getPublicServerClient } from '@/lib/server/supabasePublic'

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
  location: string | null
  venue_id: string | null
  host_user_id: string | null
  updated_at: string
  created_at: string
  poster_url: string | null
  event_type: string | null
  open_mic_type: string | null
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
}

export type PublicPerformerProfile = {
  id: string
  fullName: string
  avatarUrl: string | null
  bio: string
  websiteLink: string | null
  instagramLink: string | null
  youtubeLink: string | null
  twitterLink: string | null
  upcomingEvents: Array<{
    id: string
    slug: string | null
    title: string
    date: string
    location: string | null
    bookingStatus: string
    waitlistPosition: number | null
  }>
  upcomingCount: number
  attendedCount: number
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
  'id, slug, title, description, date, end_time, status, tickets_enabled, external_event, external_ticket_url, credits_required, location, venue_id, host_user_id, created_at, updated_at, poster_url, event_type, open_mic_type'

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
  const isFree = !eventData.tickets_enabled || (ticket ? Number(ticket.price_cents || 0) <= 0 : true)
  const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0

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
    locationText: eventData.location || '',
    venue,
    organizerName: hostRes.data?.full_name || 'One Mic Stand',
    organizerId: eventData.host_user_id || null,
    performerLineup,
    spotsConfirmed,
    audienceExpectedCount: audienceCountRes.count || 0,
    createdAt: eventData.created_at,
    updatedAt: eventData.updated_at,
    imageUrl: eventData.poster_url || null,
    eventType: eventData.event_type || null,
    openMicType: eventData.open_mic_type || null,
    communityName: communityRow?.name || null,
    communityId: communityRow?.id || null,
    communitySlug: communityRow?.slug || null,
  }
}

/**
 * Efficient batch implementation — fetches all events in 5 queries instead of N×7.
 * Replaces the old N+1 pattern that caused timeouts in production.
 */
export async function listPublicEvents(limit = 100): Promise<PublicEventDetails[]> {
  const supabase = getPublicServerClient()

  // 1. Fetch events with venue and host joined in one shot
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select(`${EVENT_SELECT}, venues!venue_id(id, name, address, city, region, postal_code, country), profiles!host_user_id(full_name)`)
    .not('status', 'in', '("cancelled","archived","draft","private")')
    .order('date', { ascending: true })
    .limit(limit)

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
    const isFree = !eventData.tickets_enabled || (ticket ? Number(ticket.price_cents || 0) <= 0 : true)
    const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0

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
      locationText: (eventData.location as string) || '',
      venue,
      organizerName: hostRaw?.full_name || 'One Mic Stand',
      organizerId: (eventData.host_user_id as string | null) || null,
      performerLineup,
      spotsConfirmed,
      audienceExpectedCount,
      createdAt: eventData.created_at as string,
      updatedAt: eventData.updated_at as string,
      imageUrl: (eventData.poster_url as string | null) || null,
      eventType: (eventData.event_type as string | null) || null,
      openMicType: (eventData.open_mic_type as string | null) || null,
      communityName: communityRow?.name || null,
      communityId: communityRow?.id || null,
      communitySlug: communityRow?.slug || null,
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
    const isFree = !eventData.tickets_enabled || (ticket ? Number(ticket.price_cents || 0) <= 0 : true)
    const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0
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
      ticketAvailability: soldOut ? 'SoldOut' : 'InStock',
      locationText: (eventData.location as string) || '', venue,
      organizerName: hostRaw?.full_name || 'One Mic Stand',
      organizerId: (eventData.host_user_id as string | null) || null,
      performerLineup, spotsConfirmed,
      audienceExpectedCount: bookings.filter((b) => b.booking_scope === 'audience').length,
      createdAt: eventData.created_at as string, updatedAt: eventData.updated_at as string,
      imageUrl: (eventData.poster_url as string | null) || null,
      eventType: (eventData.event_type as string | null) || null,
      openMicType: (eventData.open_mic_type as string | null) || null,
      communityName: communityRow?.name || null, communityId: communityRow?.id || null,
      communitySlug: communityRow?.slug || null,
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

export async function getPublicPerformerProfile(profileId: string): Promise<PublicPerformerProfile | null> {
  const supabase = getPublicServerClient()

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, bio, website_link, instagram_link, youtube_link, twitter_link')
    .eq('id', profileId)
    .maybeSingle()
  if (!profileData) return null

  const now = new Date().toISOString()
  const [bookingsRes, attendedRes] = await Promise.all([
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
      .order('booked_at', { ascending: true }),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId)
      .eq('attendance_status', 'attended'),
  ])

  const upcomingEvents = ((bookingsRes.data as any[]) || [])
    .filter((row) => row.events && row.events.status !== 'cancelled')
    .filter((row) => new Date(row.events.date) > new Date(now))
    .map((row) => ({
      id: row.events.id as string,
      slug: row.events.slug ? String(row.events.slug) : null,
      title: String(row.events.title || 'Event'),
      date: String(row.events.date),
      location: row.events.location ? String(row.events.location) : null,
      bookingStatus: String(row.status || 'confirmed'),
      waitlistPosition: row.waitlist_position ?? null,
    }))

  return {
    id: String(profileData.id),
    fullName: profileData.full_name || 'Performer',
    avatarUrl: profileData.avatar_url || null,
    bio: profileData.bio || '',
    websiteLink: profileData.website_link || null,
    instagramLink: profileData.instagram_link || null,
    youtubeLink: profileData.youtube_link || null,
    twitterLink: profileData.twitter_link || null,
    upcomingEvents,
    upcomingCount: upcomingEvents.length,
    attendedCount: attendedRes.count || 0,
  }
}
