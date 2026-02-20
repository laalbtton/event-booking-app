import { createHash } from 'crypto'

type SupabaseAdmin = {
  from: (table: string) => any
}

type EnqueueInput = {
  eventId: string
  posterUrl: string
  posterCaption: string | null
  posterUpdatedAt: string
}

function createIdempotencyKey(eventId: string, userId: string, posterUpdatedAt: string) {
  return createHash('sha256').update(`${eventId}:${userId}:${posterUpdatedAt}`).digest('hex')
}

export async function enqueuePosterAutopostJobs(supabase: SupabaseAdmin, input: EnqueueInput) {
  const { data: bookingRows, error: bookingError } = await supabase
    .from('bookings')
    .select('user_id')
    .eq('event_id', input.eventId)
    .in('status', ['confirmed', 'waitlist'])

  if (bookingError) throw bookingError

  const attendeeIds: string[] = Array.from(
    new Set((bookingRows || []).map((row: any) => row.user_id).filter((value: unknown): value is string => typeof value === 'string'))
  )
  if (attendeeIds.length === 0) return { totalAttendees: 0, jobsQueued: 0, jobsSkipped: 0 }

  const { data: socialAccounts, error: socialError } = await supabase
    .from('social_accounts')
    .select('user_id, provider, is_active')
    .eq('provider', 'instagram')
    .eq('is_active', true)
    .in('user_id', attendeeIds)

  if (socialError) throw socialError

  const socialUserSet = new Set((socialAccounts || []).map((row: any) => row.user_id))
  if (socialUserSet.size === 0) {
    return { totalAttendees: attendeeIds.length, jobsQueued: 0, jobsSkipped: attendeeIds.length }
  }

  const { data: globalPrefs, error: globalPrefError } = await supabase
    .from('poster_auto_post_prefs')
    .select('user_id, auto_post_enabled')
    .is('event_id', null)
    .in('user_id', attendeeIds)

  if (globalPrefError) throw globalPrefError

  const { data: eventPrefs, error: eventPrefError } = await supabase
    .from('poster_auto_post_prefs')
    .select('user_id, auto_post_enabled')
    .eq('event_id', input.eventId)
    .in('user_id', attendeeIds)

  if (eventPrefError) throw eventPrefError

  const globalMap = new Map<string, boolean>()
  for (const pref of globalPrefs || []) {
    globalMap.set(pref.user_id, !!pref.auto_post_enabled)
  }

  const eventMap = new Map<string, boolean>()
  for (const pref of eventPrefs || []) {
    eventMap.set(pref.user_id, !!pref.auto_post_enabled)
  }

  const jobsToUpsert = attendeeIds
    .filter((userId) => socialUserSet.has(userId))
    .filter((userId) => {
      if (eventMap.has(userId)) return eventMap.get(userId) === true
      return globalMap.get(userId) === true
    })
    .map((userId) => ({
      user_id: userId,
      event_id: input.eventId,
      provider: 'instagram',
      poster_url: input.posterUrl,
      poster_caption: input.posterCaption,
      status: 'pending',
      attempt_count: 0,
      last_error: null,
      scheduled_for: new Date().toISOString(),
      processed_at: null,
      idempotency_key: createIdempotencyKey(input.eventId, userId, input.posterUpdatedAt),
    }))

  if (jobsToUpsert.length > 0) {
    const { error: upsertError } = await supabase
      .from('social_post_jobs')
      .upsert(jobsToUpsert, { onConflict: 'idempotency_key', ignoreDuplicates: false })

    if (upsertError) throw upsertError
  }

  return {
    totalAttendees: attendeeIds.length,
    jobsQueued: jobsToUpsert.length,
    jobsSkipped: attendeeIds.length - jobsToUpsert.length,
  }
}
