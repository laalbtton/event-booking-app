export const MAX_GUEST_PARTY_SIZE = 4

type BookingClient = {
  from: (table: string) => any
}

export function clampGuestPartySize(value: unknown): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return 1
  return Math.min(MAX_GUEST_PARTY_SIZE, Math.max(1, n))
}

export function spotsForBooking(row: { party_size?: number | null } | null | undefined): number {
  return clampGuestPartySize(row?.party_size ?? 1)
}

export function sumAudienceSpots(
  rows: Array<{ booking_scope?: string | null; party_size?: number | null } | null | undefined>,
): number {
  return rows.reduce((sum, row) => {
    if (!row || row.booking_scope !== 'audience') return sum
    return sum + spotsForBooking(row)
  }, 0)
}

export async function sumConfirmedAudienceSpots(supabase: BookingClient, eventId: string) {
  const { data, error } = await supabase
    .from('bookings')
    .select('party_size')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')
    .eq('booking_scope', 'audience')

  if (error) return { spots: 0, error }
  const spots = (data || []).reduce(
    (sum: number, row: { party_size?: number | null }) => sum + spotsForBooking(row),
    0,
  )
  return { spots, error: null }
}
