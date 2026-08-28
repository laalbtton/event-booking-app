import { NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { resolveEventManageAccess } from '@/lib/server/eventPermissions'
import {
  buildRoleSlots,
  eventOffersPerformerRoles,
  findHeldRole,
  isPerformerRoleKey,
  type PerformerRoleHolder,
} from '@/lib/performerRoles'
import {
  notifyPerformerRoleAssigned,
  notifyPerformerRoleRemoved,
  promptOpenPerformerRoles,
} from '@/lib/server/performerRoleNotify'
import type { EventPerformerRoleKey } from '@/lib/supabase'
import type { SupabaseClient } from '@supabase/supabase-js'

type EventRow = {
  id: string
  slug: string | null
  title: string | null
  status: string | null
  event_type: string | null
  open_mic_type: string | null
}

const EVENT_COLUMNS = 'id, slug, title, status, event_type, open_mic_type'

/** Maps a reason from the SQL functions onto something worth showing a user. */
const REASON_MESSAGES: Record<string, string> = {
  unknown_role: 'That role does not exist.',
  event_not_eligible: 'This event does not offer performer roles.',
  not_confirmed_performer: 'Only confirmed performers can take a role at this event.',
  role_disabled: 'The host has turned that role off for this event.',
  already_claimed: 'Someone else just took that role.',
  holds_other_role: 'They already have another role at this event.',
}

async function fetchConfirmedPerformers(
  supabase: SupabaseClient,
  eventId: string,
): Promise<PerformerRoleHolder[]> {
  const { data } = await supabase
    .from('bookings')
    .select('user_id, booking_scope, profiles(id, full_name, avatar_url)')
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const unique = new Map<string, PerformerRoleHolder>()
  for (const row of data ?? []) {
    const booking = row as {
      booking_scope?: string | null
      profiles?:
        | { id: string; full_name: string | null; avatar_url: string | null }
        | { id: string; full_name: string | null; avatar_url: string | null }[]
        | null
    }
    // Legacy bookings predate booking_scope and are performer rows.
    if ((booking.booking_scope ?? 'performer') === 'audience') continue
    const nested = booking.profiles
    const profile = Array.isArray(nested) ? nested[0] : nested
    if (!profile || unique.has(profile.id)) continue
    unique.set(profile.id, {
      id: profile.id,
      fullName: profile.full_name,
      avatarUrl: profile.avatar_url,
    })
  }

  return [...unique.values()].sort((a, b) => (a.fullName ?? '').localeCompare(b.fullName ?? ''))
}

async function buildState(supabase: SupabaseClient, event: EventRow, userId: string) {
  const offersRoles = eventOffersPerformerRoles(event)

  if (!offersRoles) {
    return {
      offersRoles: false,
      roles: [],
      viewer: { canManage: false, isConfirmedPerformer: false, heldRoleKey: null },
      performers: [],
    }
  }

  const [{ data: roleRows }, access, performers] = await Promise.all([
    supabase
      .from('event_performer_roles')
      .select('role_key, enabled, assigned_user_id, assigned_at, assigned_by')
      .eq('event_id', event.id),
    resolveEventManageAccess(supabase, event.id, userId),
    fetchConfirmedPerformers(supabase, event.id),
  ])

  const holders = new Map(performers.map((performer) => [performer.id, performer]))

  // A holder who has since cancelled is no longer in the performer list, so look
  // up anyone still assigned but missing, rather than rendering a blank name.
  const missingHolderIds = (roleRows ?? [])
    .map((row) => row.assigned_user_id)
    .filter((id): id is string => !!id && !holders.has(id))

  if (missingHolderIds.length > 0) {
    const { data: strays } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url')
      .in('id', missingHolderIds)
    for (const profile of strays ?? []) {
      holders.set(profile.id, {
        id: profile.id,
        fullName: profile.full_name,
        avatarUrl: profile.avatar_url,
      })
    }
  }

  return {
    offersRoles: true,
    roles: buildRoleSlots(roleRows, holders),
    viewer: {
      canManage: access.canManage,
      isConfirmedPerformer: performers.some((performer) => performer.id === userId),
      heldRoleKey: findHeldRole(roleRows, userId),
    },
    // Only a manager needs the roster, and it is the only place it is exposed.
    performers: access.canManage ? performers : [],
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId } = await params
    const { data: event } = await supabase.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle()
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    return NextResponse.json(await buildState(supabase, event as EventRow, user.id))
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/events/performer-roles GET]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId } = await params
    const body = await request.json().catch(() => ({}))
    const { action, roleKey, userId: targetUserId, enabled } = body as {
      action?: string
      roleKey?: string
      userId?: string | null
      enabled?: boolean
    }

    if (!isPerformerRoleKey(roleKey)) {
      return NextResponse.json({ error: 'Unknown role' }, { status: 400 })
    }

    const { data: eventData } = await supabase.from('events').select(EVENT_COLUMNS).eq('id', eventId).maybeSingle()
    if (!eventData) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    const event = eventData as EventRow
    if (!eventOffersPerformerRoles(event)) {
      return NextResponse.json({ error: REASON_MESSAGES.event_not_eligible }, { status: 400 })
    }

    const role = roleKey as EventPerformerRoleKey

    switch (action) {
      case 'claim': {
        const { data, error } = await supabase.rpc('claim_event_performer_role', {
          p_event_id: eventId,
          p_role_key: role,
          p_user_id: user.id,
        })
        if (error) throw error

        const result = (Array.isArray(data) ? data[0] : data) as
          | { claimed: boolean; holder_user_id: string | null; reason: string }
          | undefined

        if (!result?.claimed) {
          const reason = result?.reason ?? 'already_claimed'
          const message =
            reason === 'holds_other_role'
              ? 'You already have another role at this event.'
              : REASON_MESSAGES[reason] ?? 'Could not take that role.'
          return NextResponse.json(
            { error: message, reason, state: await buildState(supabase, event, user.id) },
            { status: 409 },
          )
        }
        break
      }

      case 'release': {
        const { data: current } = await supabase
          .from('event_performer_roles')
          .select('assigned_user_id')
          .eq('event_id', eventId)
          .eq('role_key', role)
          .maybeSingle()

        const holderId = current?.assigned_user_id ?? null
        if (!holderId) break // Already free; treat as success so the UI settles.

        const access = await resolveEventManageAccess(supabase, eventId, user.id)
        if (!access.canManage) {
          return NextResponse.json(
            { error: 'Only the host can change who has this role.' },
            { status: 403 },
          )
        }

        const { data, error } = await supabase.rpc('assign_event_performer_role', {
          p_event_id: eventId,
          p_role_key: role,
          p_user_id: null,
          p_assigned_by: user.id,
        })
        if (error) throw error

        const result = (Array.isArray(data) ? data[0] : data) as { ok: boolean; reason: string } | undefined
        if (!result?.ok) {
          const reason = result?.reason ?? 'unknown'
          return NextResponse.json({ error: REASON_MESSAGES[reason] ?? 'Could not release that role.' }, { status: 409 })
        }

        if (holderId !== user.id) {
          await notifyPerformerRoleRemoved(supabase, { event, roleKey: role, userId: holderId })
        }
        break
      }

      case 'assign': {
        const access = await resolveEventManageAccess(supabase, eventId, user.id)
        if (!access.canManage) {
          return NextResponse.json({ error: 'Only the host can assign roles.' }, { status: 403 })
        }
        if (!targetUserId) {
          return NextResponse.json({ error: 'Pick someone to assign.' }, { status: 400 })
        }

        const { data: previous } = await supabase
          .from('event_performer_roles')
          .select('assigned_user_id')
          .eq('event_id', eventId)
          .eq('role_key', role)
          .maybeSingle()
        const previousHolderId = previous?.assigned_user_id ?? null

        const { data, error } = await supabase.rpc('assign_event_performer_role', {
          p_event_id: eventId,
          p_role_key: role,
          p_user_id: targetUserId,
          p_assigned_by: user.id,
        })
        if (error) throw error

        const result = (Array.isArray(data) ? data[0] : data) as { ok: boolean; reason: string } | undefined
        if (!result?.ok) {
          const reason = result?.reason ?? 'unknown'
          return NextResponse.json(
            { error: REASON_MESSAGES[reason] ?? 'Could not assign that role.', reason },
            { status: 409 },
          )
        }

        if (previousHolderId && previousHolderId !== targetUserId) {
          await notifyPerformerRoleRemoved(supabase, { event, roleKey: role, userId: previousHolderId })
        }
        if (targetUserId !== user.id) {
          await notifyPerformerRoleAssigned(supabase, { event, roleKey: role, userId: targetUserId })
        }
        break
      }

      case 'set-enabled': {
        const access = await resolveEventManageAccess(supabase, eventId, user.id)
        if (!access.canManage) {
          return NextResponse.json({ error: 'Only the host can turn roles on or off.' }, { status: 403 })
        }
        if (typeof enabled !== 'boolean') {
          return NextResponse.json({ error: 'Missing enabled flag.' }, { status: 400 })
        }

        const { data: current } = await supabase
          .from('event_performer_roles')
          .select('assigned_user_id')
          .eq('event_id', eventId)
          .eq('role_key', role)
          .maybeSingle()
        const holderId = current?.assigned_user_id ?? null

        // Turning a role off means the job is not happening, so whoever holds it
        // is released rather than left believing they are still on it.
        const clearAssignment = !enabled && !!holderId
        const now = new Date().toISOString()

        const { error } = await supabase.from('event_performer_roles').upsert(
          {
            event_id: eventId,
            role_key: role,
            enabled,
            updated_at: now,
            ...(clearAssignment
              ? { assigned_user_id: null, assigned_at: null, assigned_by: null }
              : {}),
          },
          { onConflict: 'event_id,role_key' },
        )
        if (error) throw error

        if (clearAssignment && holderId) {
          await notifyPerformerRoleRemoved(supabase, { event, roleKey: role, userId: holderId })
        }

        if (enabled) {
          await promptOpenPerformerRoles(supabase, eventId, {
            ignoreNotifiedAt: true,
            roleKeys: [role],
          })
        }
        break
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    return NextResponse.json({ success: true, state: await buildState(supabase, event, user.id) })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('[api/events/performer-roles POST]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
