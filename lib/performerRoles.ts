import { EVENT_PERFORMER_ROLE_KEYS, type EventPerformerRole, type EventPerformerRoleKey } from '@/lib/supabase'

export const PERFORMER_ROLE_LABELS: Record<EventPerformerRoleKey, string> = {
  time_keeper: 'Time Keeper',
  setup_wrapup: 'Setup / Wrapup',
}

export const PERFORMER_ROLE_DESCRIPTIONS: Record<EventPerformerRoleKey, string> = {
  time_keeper: 'Track set lengths and give performers their time signals.',
  setup_wrapup: 'Help set up the mic and seating before the show, and pack down after.',
}

export function isPerformerRoleKey(value: unknown): value is EventPerformerRoleKey {
  return typeof value === 'string' && (EVENT_PERFORMER_ROLE_KEYS as readonly string[]).includes(value)
}

type EventEligibilityFields = {
  event_type?: string | null
  open_mic_type?: string | null
  status?: string | null
}

/**
 * Roles are offered on comedy open mics and older open mics that never got an
 * `open_mic_type` (those are comedy in practice). Variety arts open mics and
 * booked shows are excluded. Mirrors the same check inside
 * claim_event_performer_role, so changing one means changing both.
 */
export function eventOffersPerformerRoles(event: EventEligibilityFields | null | undefined): boolean {
  if (!event) return false
  if (event.event_type !== 'open_mic') return false
  if (event.open_mic_type === 'variety_arts_open_mic') return false
  return (event.status ?? 'active') === 'active'
}

export type PerformerRoleHolder = {
  id: string
  fullName: string | null
  avatarUrl: string | null
}

export type PerformerRoleSlot = {
  roleKey: EventPerformerRoleKey
  label: string
  description: string
  enabled: boolean
  holder: PerformerRoleHolder | null
  assignedAt: string | null
  /** True when the holder took it themselves rather than being assigned by the host. */
  selfClaimed: boolean
}

type RoleRow = Pick<
  EventPerformerRole,
  'role_key' | 'enabled' | 'assigned_user_id' | 'assigned_at' | 'assigned_by'
>

/**
 * Expands stored rows into one slot per role.
 *
 * Both roles are offered by default and rows are only written once something
 * happens to them, so an absent row resolves to enabled and unclaimed.
 */
export function buildRoleSlots(
  rows: RoleRow[] | null | undefined,
  holders: Map<string, PerformerRoleHolder>,
): PerformerRoleSlot[] {
  return EVENT_PERFORMER_ROLE_KEYS.map((roleKey) => {
    const row = (rows ?? []).find((candidate) => candidate.role_key === roleKey)
    const assignedUserId = row?.assigned_user_id ?? null

    return {
      roleKey,
      label: PERFORMER_ROLE_LABELS[roleKey],
      description: PERFORMER_ROLE_DESCRIPTIONS[roleKey],
      enabled: row ? row.enabled : true,
      holder: assignedUserId ? holders.get(assignedUserId) ?? null : null,
      assignedAt: row?.assigned_at ?? null,
      selfClaimed: !!assignedUserId && !row?.assigned_by,
    }
  })
}

/** The role this user currently holds at the event, if any. */
export function findHeldRole(
  rows: RoleRow[] | null | undefined,
  userId: string | null | undefined,
): EventPerformerRoleKey | null {
  if (!userId) return null
  const row = (rows ?? []).find((candidate) => candidate.assigned_user_id === userId)
  return row ? row.role_key : null
}
