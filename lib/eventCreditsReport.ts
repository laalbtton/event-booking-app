import type { SupabaseClient } from '@supabase/supabase-js'

export type EventCreditsReportRow = {
  eventId: string
  eventTitle: string
  eventDate: string
  venueName: string | null
  venueVouchersTotalCents: number | null // total value of issued venue vouchers for this event (CAD cents)
  totalCreditsUsed: number
  bookingCount: number
  purchasedCreditsUsed: number | null
  complimentaryCreditsUsed: number | null
  venueCreditsUsed: number | null // venue-pass credits applied at this event
  venueCreditsPurchased: number | null // purchased credits used at this venue
  moneySpentCad: number | null // 1 credit = $1 CAD for purchased credits
}

export async function fetchEventCreditsReport(
  supabase: SupabaseClient,
  options: { eventId?: string; fromDate?: string; toDate?: string; venueId?: string }
): Promise<EventCreditsReportRow[]> {
  const { eventId, fromDate, toDate, venueId } = options

  let eventsQuery = supabase
    .from('events')
    .select('id, title, date, venue_id')
    .neq('status', 'cancelled')
    .order('date', { ascending: false })
    .limit(500)

  if (eventId) eventsQuery = eventsQuery.eq('id', eventId)
  if (fromDate) eventsQuery = eventsQuery.gte('date', `${fromDate}T00:00:00`)
  if (toDate) eventsQuery = eventsQuery.lte('date', `${toDate}T23:59:59`)
  if (venueId) eventsQuery = eventsQuery.eq('venue_id', venueId)

  const { data: events, error: eventsError } = await eventsQuery
  if (eventsError) throw eventsError

  const eventIds = (events || []).map((e: any) => e.id)
  if (eventIds.length === 0) return []

  const venueIds = [...new Set((events || []).map((e: any) => e.venue_id).filter(Boolean))]
  const venueMap = new Map<string, string>()
  if (venueIds.length > 0) {
    const { data: venues } = await supabase
      .from('venues')
      .select('id, name')
      .in('id', venueIds)
    for (const v of venues || []) {
      venueMap.set(v.id, v.name || '')
    }
  }

  const [{ data: bookings, error: bookingsError }, { data: vouchers, error: vouchersError }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, event_id, credits_used, credits_purchased_used, credits_complimentary_used, credits_venue_used, user_id')
      .in('event_id', eventIds)
      .in('status', ['confirmed', 'waitlist']),
    supabase
      .from('booking_vouchers')
      .select('event_id, value_cents')
      .in('event_id', eventIds)
      .in('status', ['issued', 'redeemed']),
  ])

  if (bookingsError) throw bookingsError
  if (vouchersError) throw vouchersError

  const voucherTotalByEvent = new Map<string, number>()
  for (const v of vouchers || []) {
    const key = v.event_id
    voucherTotalByEvent.set(key, (voucherTotalByEvent.get(key) || 0) + Number(v.value_cents || 0))
  }

  const byEvent = new Map<string, { total: number; count: number; purchased: number; complimentary: number; venue: number }>()
  for (const b of bookings || []) {
    const key = b.event_id
    const existing = byEvent.get(key) || { total: 0, count: 0, purchased: 0, complimentary: 0, venue: 0 }
    existing.total += Number(b.credits_used || 0)
    existing.count += 1
    const pUsed = Number(b.credits_purchased_used ?? 0)
    const cUsed = Number(b.credits_complimentary_used ?? 0)
    const vUsed = Number((b as any).credits_venue_used ?? 0)
    if (pUsed > 0 || cUsed > 0 || vUsed > 0) {
      existing.purchased += pUsed
      existing.complimentary += cUsed
      existing.venue += vUsed
    }
    byEvent.set(key, existing)
  }

  return (events || []).map((e: any) => {
    const stats = byEvent.get(e.id) || { total: 0, count: 0, purchased: 0, complimentary: 0, venue: 0 }
    const hasSplit = stats.purchased > 0 || stats.complimentary > 0 || stats.venue > 0
    const venueName = e.venue_id ? venueMap.get(e.venue_id) ?? null : null
    const voucherTotal = voucherTotalByEvent.get(e.id) ?? 0
    return {
      eventId: e.id,
      eventTitle: e.title,
      eventDate: e.date,
      venueName,
      venueVouchersTotalCents: voucherTotal > 0 ? voucherTotal : null,
      totalCreditsUsed: stats.total,
      bookingCount: stats.count,
      purchasedCreditsUsed: hasSplit ? stats.purchased : null,
      complimentaryCreditsUsed: hasSplit ? stats.complimentary : null,
      venueCreditsUsed: stats.venue > 0 ? stats.venue : null,
      venueCreditsPurchased: hasSplit ? stats.purchased : null,
      moneySpentCad: hasSplit && stats.purchased > 0 ? stats.purchased : null, // 1 credit = $1 CAD
    }
  })
}
