import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeEmail } from '@/lib/foundingMembers'

export type SyncFoundingMemberCreditsResult = {
  synced: boolean
  creditsGranted: number
  newBalance: number | null
  alreadySynced: boolean
  matched: boolean
  error?: string
  debug?: Record<string, unknown>
}

type FoundingMemberRow = {
  id: string
  email: string
  total_credits_earned: number
  profile_credits_synced?: number | null
  profile_user_id?: string | null
}

type ProfileRow = {
  id: string
  email: string
  role: string | null
  credits: number
  credits_complimentary: number | null
  full_name: string | null
}

const SOURCE_REASON = 'founding_member_insider'

/** Minimal columns that exist on all founding_members installs. */
const MEMBER_SELECT_MIN = 'id, email, total_credits_earned'
const MEMBER_SELECT_FULL =
  'id, email, total_credits_earned, profile_credits_synced, profile_user_id'

async function selectMember(
  supabase: SupabaseClient,
  build: (cols: string) => Promise<{ data: unknown; error: { message?: string } | null }>,
): Promise<FoundingMemberRow | null> {
  // Prefer full select; fall back if optional columns are missing locally.
  const full = await build(MEMBER_SELECT_FULL)
  if (!full.error && full.data) return full.data as FoundingMemberRow

  const minimal = await build(MEMBER_SELECT_MIN)
  if (!minimal.error && minimal.data) {
    return {
      ...(minimal.data as FoundingMemberRow),
      profile_credits_synced: 0,
      profile_user_id: null,
    }
  }

  if (full.error) {
    console.warn('[findFoundingMember] select error:', full.error.message)
  }
  if (minimal.error) {
    console.warn('[findFoundingMember] minimal select error:', minimal.error.message)
  }
  return null
}

async function findFoundingMember(
  supabase: SupabaseClient,
  params: { userId?: string; email?: string; memberId?: string },
): Promise<FoundingMemberRow | null> {
  if (params.memberId) {
    const byId = await selectMember(supabase, async (cols) => {
      const res = await supabase.from('founding_members').select(cols).eq('id', params.memberId!).maybeSingle()
      return { data: res.data, error: res.error }
    })
    if (byId) return byId
  }

  if (params.userId) {
    const byUser = await selectMember(supabase, async (cols) => {
      // profile_user_id may not exist yet — full select handles that via fallback.
      const res = await supabase
        .from('founding_members')
        .select(cols)
        .eq('profile_user_id', params.userId!)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return { data: res.data, error: res.error }
    })
    if (byUser) return byUser
  }

  const email = params.email ? normalizeEmail(params.email) : ''
  if (!email) return null

  const exact = await selectMember(supabase, async (cols) => {
    const res = await supabase.from('founding_members').select(cols).eq('email', email).maybeSingle()
    return { data: res.data, error: res.error }
  })
  if (exact) return exact

  return selectMember(supabase, async (cols) => {
    const res = await supabase
      .from('founding_members')
      .select(cols)
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    return { data: res.data, error: res.error }
  })
}

async function sumInsiderCreditsGranted(
  supabase: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('amount')
    .eq('user_id', userId)
    .eq('source_reason', SOURCE_REASON)

  if (error) {
    console.error('[syncFoundingMemberCredits] tx sum failed:', error)
    return 0
  }

  return (data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
}

/**
 * Grant unredeemed Brampton Comedy Insider campaign credits to an audience
 * member's profile ledger.
 *
 * Lookup order: memberId → profile_user_id → email (exact / ilike).
 * Payout truth: credit_transactions with source_reason = founding_member_insider.
 */
export async function syncFoundingMemberCreditsToProfile(
  supabase: SupabaseClient,
  params: { userId: string; email?: string; memberId?: string },
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

  if (profileError || !profile) {
    console.error('[syncFoundingMemberCreditsToProfile] profile missing', {
      userId: params.userId,
      profileError,
    })
    return { ...empty, error: profileError?.message || 'Profile not found' }
  }

  const typedProfile = profile as ProfileRow
  const email = normalizeEmail(params.email || typedProfile.email || '')

  const typedMember = await findFoundingMember(supabase, {
    userId: params.userId,
    email: email || undefined,
    memberId: params.memberId,
  })

  if (!typedMember) {
    console.warn('[syncFoundingMemberCreditsToProfile] founding member missing', {
      userId: params.userId,
      email,
      memberId: params.memberId,
    })
    return {
      ...empty,
      error: 'Founding member row not found',
      debug: { userId: params.userId, email, memberId: params.memberId ?? null },
    }
  }

  // Best-effort: keep profile_user_id linked for future lookups.
  if (params.userId && typedMember.profile_user_id !== params.userId) {
    await supabase
      .from('founding_members')
      .update({ profile_user_id: params.userId })
      .eq('id', typedMember.id)
  }

  const totalEarned = Math.max(0, Number(typedMember.total_credits_earned || 0))
  const alreadyGranted = await sumInsiderCreditsGranted(supabase, params.userId)
  const delta = totalEarned - alreadyGranted

  if (delta <= 0) {
    if ((typedMember.profile_credits_synced ?? 0) !== totalEarned) {
      await supabase
        .from('founding_members')
        .update({ profile_credits_synced: totalEarned })
        .eq('id', typedMember.id)
    }
    return {
      ...empty,
      matched: true,
      alreadySynced: true,
      newBalance: typedProfile.credits,
      debug: { memberId: typedMember.id, email: typedMember.email, totalEarned, alreadyGranted },
    }
  }

  const nowIso = new Date().toISOString()

  if (typedProfile.role !== 'audience') {
    await supabase
      .from('profiles')
      .update({ role: 'audience', updated_at: nowIso })
      .eq('id', params.userId)
  }

  const { data: freshProfile } = await supabase
    .from('profiles')
    .select('credits, credits_complimentary')
    .eq('id', params.userId)
    .maybeSingle()

  const currentCredits = Number(freshProfile?.credits ?? typedProfile.credits ?? 0)
  const currentComplimentary = Number(
    freshProfile?.credits_complimentary ?? typedProfile.credits_complimentary ?? 0,
  )
  const nextCredits = currentCredits + delta
  const nextComplimentary = currentComplimentary + delta

  const { data: updatedProfile, error: profileUpdateError } = await supabase
    .from('profiles')
    .update({
      credits: nextCredits,
      credits_complimentary: nextComplimentary,
      updated_at: nowIso,
    })
    .eq('id', params.userId)
    .select('credits')
    .maybeSingle()

  if (profileUpdateError || !updatedProfile) {
    console.error('profile credit update failed:', profileUpdateError)
    return {
      ...empty,
      matched: true,
      error: profileUpdateError?.message || 'Profile credit update failed',
      debug: { memberId: typedMember.id, delta },
    }
  }

  const { error: txError } = await supabase.from('credit_transactions').insert({
    user_id: params.userId,
    amount: delta,
    transaction_type: 'manual_add',
    reference_id: typedMember.id,
    notes: 'Brampton Comedy Insider campaign credits',
    credit_source: 'in_kind',
    source_reason: SOURCE_REASON,
    created_by: params.userId,
  })

  if (txError) {
    console.error('founding member credit_transaction insert failed:', txError)
  }

  await supabase
    .from('founding_members')
    .update({ profile_credits_synced: totalEarned })
    .eq('id', typedMember.id)

  return {
    synced: true,
    creditsGranted: delta,
    newBalance: Number(updatedProfile.credits ?? nextCredits),
    alreadySynced: false,
    matched: true,
    debug: { memberId: typedMember.id, email: typedMember.email, totalEarned, alreadyGranted, delta },
  }
}

/** Best-effort sync when a profile already exists for the campaign email. */
export async function syncFoundingMemberCreditsByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<SyncFoundingMemberCreditsResult> {
  const normalized = normalizeEmail(email)
  const empty: SyncFoundingMemberCreditsResult = {
    synced: false,
    creditsGranted: 0,
    newBalance: null,
    alreadySynced: false,
    matched: false,
  }

  let profileId: string | null = null

  const { data: exact } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', normalized)
    .maybeSingle()

  if (exact?.id) {
    profileId = exact.id
  } else {
    const { data: fuzzy } = await supabase
      .from('profiles')
      .select('id')
      .ilike('email', normalized)
      .limit(1)
      .maybeSingle()
    profileId = fuzzy?.id ?? null
  }

  if (!profileId) {
    console.warn('[syncFoundingMemberCreditsByEmail] no profile for email', normalized)
    return { ...empty, error: 'No profile for campaign email', debug: { email: normalized } }
  }

  return syncFoundingMemberCreditsToProfile(supabase, {
    userId: profileId,
    email: normalized,
  })
}
