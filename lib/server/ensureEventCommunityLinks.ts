import type { SupabaseClient } from '@supabase/supabase-js'
import { communityAutoApprovesNewEvents } from '@/lib/communityAutoApprove'

const MAX_COMMUNITIES = 3

/** Prefer linking communities where the creator has host/creator roles, then plain membership. */
function rankCommunityRole(role: string | null | undefined): number {
  if (role === 'admin') return 0
  if (role === 'co_admin') return 1
  if (role === 'event_creator') return 2
  if (role === 'member') return 3
  return 99
}

/**
 * Build up to MAX_COMMUNITIES community IDs for the creator (any membership role).
 * Uniqued; ordered by role preference then joined_at.
 */
function orderedCommunityIdsForCreator(
  memberships: { community_id: string; joined_at: string; role: string }[]
): string[] {
  const sorted = [...memberships].sort((a, b) => {
    const ra = rankCommunityRole(a.role)
    const rb = rankCommunityRole(b.role)
    if (ra !== rb) return ra - rb
    return new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
  })
  const out: string[] = []
  const seen = new Set<string>()
  for (const m of sorted) {
    const cid = m.community_id
    if (seen.has(cid)) continue
    seen.add(cid)
    out.push(cid)
    if (out.length >= MAX_COMMUNITIES) break
  }
  return out
}

/**
 * For an active event, ensure up to MAX_COMMUNITIES approved links to communities
 * the creator belongs to (including role `member` — not only event_creator+).
 * Upgrades pending links to approved. Reconciles is_primary to match membership order.
 */
export async function ensureApprovedCommunityLinksForEvent(
  supabase: SupabaseClient,
  eventId: string,
  creatorUserId: string
): Promise<{ linked: number; upgraded: number; membershipCommunities: number }> {
  const { data: memberships, error: memErr } = await supabase
    .from('community_members')
    .select('community_id, joined_at, role')
    .eq('user_id', creatorUserId)

  if (memErr) throw memErr
  if (!memberships?.length) return { linked: 0, upgraded: 0, membershipCommunities: 0 }

  const membershipOrder = orderedCommunityIdsForCreator(memberships as { community_id: string; joined_at: string; role: string }[])
  if (membershipOrder.length === 0) {
    return { linked: 0, upgraded: 0, membershipCommunities: 0 }
  }

  const { data: communityRows } = await supabase
    .from('communities')
    .select('id, auto_approve_new_events')
    .in('id', membershipOrder)

  const autoApproveByCommunity = new Map<string, boolean>()
  for (const c of communityRows || []) {
    const row = c as { id: string; auto_approve_new_events?: boolean }
    autoApproveByCommunity.set(row.id, communityAutoApprovesNewEvents(row.auto_approve_new_events))
  }

  const { data: existing, error: exErr } = await supabase
    .from('event_communities')
    .select('id, community_id, status, is_primary')
    .eq('event_id', eventId)

  if (exErr) throw exErr

  const rows = existing || []
  const byCid = new Map(rows.map((r) => [r.community_id as string, r]))

  let activeCount = rows.filter((r) => ['approved', 'pending'].includes(r.status as string)).length
  let linked = 0
  let upgraded = 0

  const now = new Date().toISOString()

  for (const cid of membershipOrder) {
    if (activeCount >= MAX_COMMUNITIES) break

    const allowAuto = autoApproveByCommunity.get(cid) !== false

    const row = byCid.get(cid)
    if (!row) {
      const approve = allowAuto
      const { error: insErr } = await supabase.from('event_communities').insert({
        event_id: eventId,
        community_id: cid,
        is_primary: false,
        status: approve ? 'approved' : 'pending',
        submitted_by: creatorUserId,
        submitted_at: now,
        reviewed_by: approve ? creatorUserId : null,
        reviewed_at: approve ? now : null,
        expires_at: null,
      })
      if (insErr) {
        console.warn('ensureEventCommunityLinks insert skipped:', cid, insErr.message)
        continue
      }
      linked += 1
      activeCount += 1
      continue
    }

    if (row.status === 'pending') {
      if (!allowAuto) {
        continue
      }
      const { error: upErr } = await supabase
        .from('event_communities')
        .update({
          status: 'approved',
          reviewed_by: creatorUserId,
          reviewed_at: now,
          expires_at: null,
        })
        .eq('id', row.id as string)
      if (!upErr) upgraded += 1
      continue
    }

    if (row.status === 'approved') {
      continue
    }

    if (row.status === 'rejected' || row.status === 'expired') {
      continue
    }
  }

  // Re-fetch and set exactly one primary: first membership community that has an active link
  const { data: after } = await supabase
    .from('event_communities')
    .select('id, community_id, status')
    .eq('event_id', eventId)

  const activeRows = (after || []).filter((r) => ['approved', 'pending'].includes(r.status as string))
  const primaryCid =
    membershipOrder.find((cid) => activeRows.some((r) => r.community_id === cid)) ||
    (activeRows[0]?.community_id as string | undefined)

  for (const r of activeRows) {
    const wantPrimary = primaryCid && r.community_id === primaryCid
    await supabase
      .from('event_communities')
      .update({ is_primary: !!wantPrimary })
      .eq('id', r.id as string)
  }

  return { linked, upgraded, membershipCommunities: membershipOrder.length }
}
