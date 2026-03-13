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
  poster_url: string | null
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
  performerLineup: Array<{
    id: string
    name: string
    avatarUrl: string | null
    status: 'confirmed' | 'waitlist'
    waitlistPosition: number | null
    artTypeId: string | null
    artTypeName: string | null
  }>
  audienceExpectedCount: number
  updatedAt: string
  imageUrl: string | null
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
  'id, slug, title, description, date, end_time, status, tickets_enabled, external_event, external_ticket_url, credits_required, location, venue_id, host_user_id, updated_at, poster_url'

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

  const ticket = ticketRes.data || null
  const isFree = !eventData.tickets_enabled || (ticket ? Number(ticket.price_cents || 0) <= 0 : true)
  const soldOut = !!ticket && Number(ticket.sold || 0) >= Number(ticket.quantity || 0) && Number(ticket.quantity || 0) > 0

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
    performerLineup,
    audienceExpectedCount: audienceCountRes.count || 0,
    updatedAt: eventData.updated_at,
    imageUrl: eventData.poster_url || null,
  }
}

export async function listPublicEvents(limit = 100): Promise<PublicEventDetails[]> {
  const supabase = getPublicServerClient()
  const { data: rows } = await supabase
    .from('events')
    .select('id')
    .order('date', { ascending: true })
    .limit(limit)

  const ids = (rows || []).map((r: any) => r.id as string)
  const details = await Promise.all(ids.map((id) => getPublicEventByIdentifier(id)))
  return details
    .filter((row): row is PublicEventDetails => !!row)
    .filter((row) => !['cancelled', 'archived', 'draft', 'private'].includes(String(row.status || '').toLowerCase()))
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
