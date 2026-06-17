import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/foundingMembers'

export type SyncFoundingMemberCreditsResult = {
  synced: boolean
  creditsGranted: number
  newBalance: number | null
  alreadySynced: boolean
  matched: boolean
}

type FoundingMemberRow = {
  id: string
  email: string
  total_credits_earned: number
  profile_credits_synced: number
}

type ProfileRow = {
  id: string
  email: string
  role: string | null
  credits: number
  credits_complimentary: number | null
  full_name: string | null
}

/**
 * Grant unredeemed Brampton Comedy Insider campaign credits to an audience
 * member's profile ledger. Idempotent via founding_members.profile_credits_synced.
 */
export async function syncFoundingMemberCreditsToProfile(
  supabase: SupabaseClient,
  params: { userId: string; email?: string },
): Promise<SyncFoundingMemberCreditsResult> {
  const empty: SyncFoundingMemberCreditsResult = {
    synced: false,
    creditsGranted: 0,
    newBalance: null,
    alreadySynced: false,
    matched: false,
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, role, credits, credits_complimentary, full_name')
    .eq('id', params.userId)
    .maybeSingle()

  if (profileError || !profile) return empty

  const typedProfile = profile as ProfileRow
  const email = normalizeEmail(params.email || typedProfile.email)

  const { data: member, error: memberError } = await supabase
    .from('founding_members')
    .select('id, email, total_credits_earned, profile_credits_synced')
    .eq('email', email)
    .maybeSingle()

  if (memberError || !member) return empty

  const typedMember = member as FoundingMemberRow
  const alreadySynced = typedMember.profile_credits_synced ?? 0
  const totalEarned = typedMember.total_credits_earned ?? 0
  const delta = totalEarned - alreadySynced

  if (delta <= 0) {
    return { ...empty, matched: true, alreadySynced: true, newBalance: typedProfile.credits }
  }

  const nowIso = new Date().toISOString()

  // Campaign signups are audience-only; ensure role before granting redeemable credits.
  if (typedProfile.role !== 'audience') {
    await supabase
      .from('profiles')
      .update({ role: 'audience', updated_at: nowIso })
      .eq('id', params.userId)
  }

  const nextCredits = Number(typedProfile.credits || 0) + delta
  const nextComplimentary = (typedProfile.credits_complimentary ?? 0) + delta

  // Atomic guard: only one request can advance profile_credits_synced for this delta.
  const { data: lockedMember, error: lockError } = await supabase
    .from('founding_members')
    .update({ profile_credits_synced: totalEarned })
    .eq('id', typedMember.id)
    .eq('profile_credits_synced', alreadySynced)
    .select('id')
    .maybeSingle()

  if (lockError) {
    console.error('founding member credit lock failed:', lockError)
    return { ...empty, matched: true }
  }
  if (!lockedMember) {
    return { ...empty, matched: true, alreadySynced: true, newBalance: typedProfile.credits }
  }

  const { error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      credits: nextCredits,
      credits_complimentary: nextComplimentary,
      updated_at: nowIso,
    })
    .eq('id', params.userId)

  if (profileUpdateError) {
    // Roll back the sync marker so a retry can grant credits.
    await supabase
      .from('founding_members')
      .update({ profile_credits_synced: alreadySynced })
      .eq('id', typedMember.id)
    console.error('profile credit update failed:', profileUpdateError)
    return { ...empty, matched: true }
  }

  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: params.userId,
    amount: delta,
    transaction_type: 'manual_add',
    reference_id: typedMember.id,
    notes: 'Brampton Comedy Insider campaign credits',
    credit_source: 'in_kind',
    source_reason: 'founding_member_insider',
    created_by: params.userId,
  })

  if (txError) {
    console.error('founding member credit_transaction insert failed:', txError)
    // Credits are on the profile; do not fail the caller.
  }

  return {
    synced: true,
    creditsGranted: delta,
    newBalance: nextCredits,
    alreadySynced: false,
    matched: true,
  }
}

/** Best-effort sync when a profile already exists for the campaign email. */
export async function syncFoundingMemberCreditsByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<SyncFoundingMemberCreditsResult> {
  const normalized = normalizeEmail(email)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (!profile?.id) {
    return {
      synced: false,
      creditsGranted: 0,
      newBalance: null,
      alreadySynced: false,
      matched: false,
    }
  }

  return syncFoundingMemberCreditsToProfile(supabase, {
    userId: profile.id,
    email: normalized,
  })
}
