import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/server/push'
import { PERFORMER_ROLE_LABELS, eventOffersPerformerRoles } from '@/lib/performerRoles'
import { EVENT_PERFORMER_ROLE_KEYS, type EventPerformerRoleKey } from '@/lib/supabase'

type EventRow = {
  id: string
  slug: string | null
  title: string | null
  status?: string | null
  event_type?: string | null
  open_mic_type?: string | null
}

function eventPath(event: Pick<EventRow, 'id' | 'slug'>): string {
  return `/events/${event.slug || event.id}`
}

/**
 * In-app notification rows are constrained by notifications_type_check, and every
 * migration that touches it re-declares the whole list. Reusing 'general' avoids
 * another constraint rewrite for one feature.
 */
const NOTIFICATION_TYPE = 'general'

/** Tells a performer the host put them on a role. */
export async function notifyPerformerRoleAssigned(
  supabase: SupabaseClient,
  args: { event: EventRow; roleKey: EventPerformerRoleKey; userId: string },
): Promise<void> {
  const { event, roleKey, userId } = args
  const label = PERFORMER_ROLE_LABELS[roleKey]
  const title = event.title || 'an event'

  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: NOTIFICATION_TYPE,
      title: `You're on ${label}`,
      message: `The host put you on ${label} for "${title}".`,
      related_event_id: event.id,
    })

    await sendPushToUser(
      supabase,
      userId,
      {
        title: `You're on ${label}`,
        body: `The host put you on ${label} for "${title}".`,
        data: { url: eventPath(event) },
      },
      'booking_updates',
    )
  } catch (error) {
    // Never fail the assignment because a notification could not go out.
    console.error('[performerRoleNotify] assigned', error)
  }
}

/** Tells a performer they no longer hold a role, so nobody turns up expecting to run it. */
export async function notifyPerformerRoleRemoved(
  supabase: SupabaseClient,
  args: { event: EventRow; roleKey: EventPerformerRoleKey; userId: string },
): Promise<void> {
  const { event, roleKey, userId } = args
  const label = PERFORMER_ROLE_LABELS[roleKey]
  const title = event.title || 'an event'

  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      type: NOTIFICATION_TYPE,
      title: `${label} reassigned`,
      message: `You're no longer on ${label} for "${title}".`,
      related_event_id: event.id,
    })

    await sendPushToUser(
      supabase,
      userId,
      {
        title: `${label} reassigned`,
        body: `You're no longer on ${label} for "${title}".`,
        data: { url: eventPath(event) },
      },
      'booking_updates',
    )
  } catch (error) {
    console.error('[performerRoleNotify] removed', error)
  }
}

export type OpenRolePromptResult = {
  eventId: string
  roleKeys: EventPerformerRoleKey[]
  performers: number
  sent: number
  failed: number
  skipped: number
}

type PromptOptions = {
  /**
   * Send even if notified_at is already set. Used when a host turns a role
   * back on — the earlier prompt was for a previous offering of the same slot.
   */
  ignoreNotifiedAt?: boolean
  /** When set, only this performer is prompted (they just got a confirmed spot). */
  onlyUserId?: string
  /** Restrict to these roles. Defaults to every still-open enabled role. */
  roleKeys?: EventPerformerRoleKey[]
  /**
   * Stamp notified_at after sending. The nightly cron uses this so it cannot
   * nag twice. Per-person prompts on booking leave it unset so later bookers
   * still get their own ping.
   */
  stampNotifiedAt?: boolean
}

/**
 * Prompts confirmed performers to claim whichever roles are still open.
 *
 * Performers who already hold a role are left out, since they can only hold one.
 */
export async function promptOpenPerformerRoles(
  supabase: SupabaseClient,
  eventId: string,
  options: PromptOptions = {},
): Promise<OpenRolePromptResult> {
  const empty: OpenRolePromptResult = {
    eventId,
    roleKeys: [],
    performers: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, slug, title, status, event_type, open_mic_type')
    .eq('id', eventId)
    .maybeSingle()

  if (!event || !eventOffersPerformerRoles(event as EventRow)) return empty

  const { data: roleRows } = await supabase
    .from('event_performer_roles')
    .select('role_key, enabled, assigned_user_id, notified_at')
    .eq('event_id', eventId)

  const rows = roleRows ?? []
  const candidateKeys = options.roleKeys ?? [...EVENT_PERFORMER_ROLE_KEYS]
  const openRoleKeys = candidateKeys.filter((roleKey) => {
    const row = rows.find((candidate) => candidate.role_key === roleKey)
    if (!row) return true // No row means offered, unclaimed and never prompted.
    if (!row.enabled || row.assigned_user_id) return false
    if (options.ignoreNotifiedAt) return true
    return !row.notified_at
  })

  if (openRoleKeys.length === 0) return empty

  const { data: bookings } = await supabase
    .from('bookings')
    .select('user_id, booking_scope')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  // Legacy bookings predate booking_scope and are performer rows.
  const performerIds = [
    ...new Set(
      (bookings ?? [])
        .filter((booking) => (booking.booking_scope ?? 'performer') !== 'audience')
        .map((booking) => booking.user_id as string)
        .filter(Boolean),
    ),
  ]

  const alreadyHolding = new Set(
    rows.map((row) => row.assigned_user_id).filter((id): id is string => !!id),
  )
  const recipients = performerIds.filter((id) => {
    if (alreadyHolding.has(id)) return false
    if (options.onlyUserId) return id === options.onlyUserId
    return true
  })

  const labels = openRoleKeys.map((roleKey) => PERFORMER_ROLE_LABELS[roleKey])
  const roleText = labels.length === 1 ? labels[0] : `${labels[0]} and ${labels[1]}`
  const eventTitle = event.title || 'your next open mic'
  const pushTitle = labels.length === 1 ? `${roleText} still open` : 'Help run the show?'
  const body =
    labels.length === 1
      ? `Nobody has taken ${roleText} for "${eventTitle}". Tap to claim it.`
      : `${roleText} are still unclaimed for "${eventTitle}". Tap to take one.`

  let sent = 0
  let failed = 0
  let skipped = 0

  for (const userId of recipients) {
    const result = await sendPushToUser(
      supabase,
      userId,
      { title: pushTitle, body, data: { url: eventPath(event as EventRow) } },
      'event_reminders',
    )
    sent += result.sent ?? 0
    failed += result.failed ?? 0
    if ('skipped' in result && result.skipped) skipped += 1
  }

  if (recipients.length > 0) {
    await supabase.from('notifications').insert(
      recipients.map((userId) => ({
        user_id: userId,
        type: NOTIFICATION_TYPE,
        title: pushTitle,
        message: body,
        related_event_id: event.id,
      })),
    )
  }

  // The nightly sweep stamps even when there were no recipients, so an event
  // that never had performers does not get re-examined every night. Booking-
  // time prompts leave notified_at alone so the next person to register still
  // hears about the open slot.
  if (options.stampNotifiedAt !== false && !options.onlyUserId) {
    const stampedAt = new Date().toISOString()
    await supabase.from('event_performer_roles').upsert(
      openRoleKeys.map((roleKey) => ({
        event_id: eventId,
        role_key: roleKey,
        notified_at: stampedAt,
        updated_at: stampedAt,
      })),
      { onConflict: 'event_id,role_key' },
    )
  }

  return {
    eventId,
    roleKeys: openRoleKeys,
    performers: recipients.length,
    sent,
    failed,
    skipped,
  }
}

/** Ping one newly confirmed performer about whatever roles are still open. */
export async function promptPerformerAboutOpenRoles(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<void> {
  try {
    await promptOpenPerformerRoles(supabase, eventId, {
      onlyUserId: userId,
      ignoreNotifiedAt: true,
      stampNotifiedAt: false,
    })
  } catch (error) {
    console.error('[performerRoleNotify] prompt performer', error)
  }
}
