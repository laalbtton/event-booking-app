import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventPerformerRoleKey } from '@/lib/supabase'

/**
 * Frees any optional performer role held by a user at an event.
 *
 * Called whenever someone stops being a confirmed performer — self cancellation,
 * host cancellation, or removal. Without this the manage screen would keep
 * showing a time keeper who is not coming.
 *
 * `notified_at` is cleared as well so the nightly sweep can prompt the remaining
 * performers about the slot that just reopened. A role released by the host is
 * left stamped, because the host is in the middle of reassigning it themselves.
 *
 * Never throws: losing a role assignment must not fail a cancellation.
 */
export async function releasePerformerRolesForUser(
  supabase: SupabaseClient,
  eventId: string,
  userId: string,
): Promise<EventPerformerRoleKey[]> {
  try {
    const { data, error } = await supabase
      .from('event_performer_roles')
      .update({
        assigned_user_id: null,
        assigned_at: null,
        assigned_by: null,
        notified_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('event_id', eventId)
      .eq('assigned_user_id', userId)
      .select('role_key')

    if (error) {
      console.error('[releasePerformerRolesForUser]', error)
      return []
    }

    return (data ?? []).map((row) => row.role_key as EventPerformerRoleKey)
  } catch (error) {
    console.error('[releasePerformerRolesForUser]', error)
    return []
  }
}
