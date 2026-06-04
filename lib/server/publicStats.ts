import { getPublicServerClient } from '@/lib/server/supabasePublic'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export type PublicAppStats = {
  usersRegistered: number
  eventsHosted: number
  performerSlotsBooked: number
}

/**
 * Some of these tables (profiles, bookings) are gated by RLS that blocks the
 * anon key, so counts come back as 0. Prefer the service-role client (bypasses
 * RLS) and fall back to the public client when it is unavailable.
 */
function getStatsClient() {
  return getAdminClient() ?? getPublicServerClient()
}

/** Statuses that never represent a real, public-facing event. */
const NON_PUBLIC_EVENT_STATUSES = '("draft","private","pending_approval")'

async function safeCount(promise: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await promise
    if (error) return 0
    return count ?? 0
  } catch {
    return 0
  }
}

/**
 * Aggregate public activity stats for the marketing home page.
 * All values are all-time totals and safe to expose to anonymous visitors
 * (counts only — no rows or personal data are returned).
 */
export async function getPublicAppStats(): Promise<PublicAppStats> {
  const supabase = getStatsClient()

  const [usersRegistered, eventsHosted, totalConfirmed, audienceConfirmed] = await Promise.all([
    safeCount(
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
    ),
    safeCount(
      supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .not('status', 'in', NON_PUBLIC_EVENT_STATUSES),
    ),
    safeCount(
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed'),
    ),
    safeCount(
      supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .eq('booking_scope', 'audience'),
    ),
  ])

  // Performer slots = confirmed bookings that are not audience reservations.
  // Historical performer rows may have a null booking_scope, so subtracting the
  // audience subset keeps them counted.
  const performerSlotsBooked = Math.max(0, totalConfirmed - audienceConfirmed)

  return {
    usersRegistered,
    eventsHosted,
    performerSlotsBooked,
  }
}
