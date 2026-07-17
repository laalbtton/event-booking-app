import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { computeTotalCredits, normalizeEmail } from '@/lib/foundingMembers'
import { syncFoundingMemberCreditsToProfile } from '@/lib/server/syncFoundingMemberCredits'

/**
 * Enroll an already-authenticated app user into Brampton Comedy Insider.
 * Skips magic-link / account-creation credits — they already have an account.
 * Awards email-update credit when opted in; preferences credit comes later.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const emailUpdatesOptIn = body?.emailUpdatesOptIn === true

    const userId = authData.user.id
    const email = normalizeEmail(authData.user.email)
    const nowIso = new Date().toISOString()

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, full_name, email')
      .eq('id', userId)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }
    if (profile.role !== 'audience') {
      return NextResponse.json(
        { error: 'This promotion is available to audience members only.' },
        { status: 403 },
      )
    }

    const firstName =
      (typeof profile.full_name === 'string' && profile.full_name.trim().split(/\s+/)[0]) ||
      email.split('@')[0] ||
      'Member'

    const { data: existing } = await supabase
      .from('founding_members')
      .select(
        'id, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, whatsapp_credit_awarded, app_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
      )
      .eq('email', email)
      .maybeSingle()

    // Existing app users do not earn the "create account" campaign credit.
    const flags = {
      account_credit_awarded: existing?.account_credit_awarded ?? false,
      preferences_credit_awarded: existing?.preferences_credit_awarded ?? false,
      email_updates_credit_awarded:
        existing?.email_updates_credit_awarded || emailUpdatesOptIn,
      whatsapp_credit_awarded: existing?.whatsapp_credit_awarded ?? false,
      app_credit_awarded: existing?.app_credit_awarded ?? false,
    }

    const totalCredits = computeTotalCredits(flags)

    const basePayload = {
      first_name: firstName,
      email,
      email_updates_opt_in: Boolean(existing?.email_updates_opt_in || emailUpdatesOptIn),
      signup_completed: true,
      app_account_activated: true,
      total_credits_earned: totalCredits,
      ...flags,
    }

    // Prefer linking to the app user; fall back if profile_user_id column isn't migrated yet.
    let saved = null as {
      id: string
      total_credits_earned: number
      account_credit_awarded: boolean
      preferences_credit_awarded: boolean
      email_updates_credit_awarded: boolean
      signup_completed: boolean
      preferences_completed: boolean
      email_updates_opt_in: boolean
      first_name: string | null
      email: string
    } | null
    let upsertError: { message?: string } | null = null

    {
      const attempt = await supabase
        .from('founding_members')
        .upsert({ ...basePayload, profile_user_id: userId }, { onConflict: 'email' })
        .select(
          'id, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in, first_name, email',
        )
        .maybeSingle()

      if (!attempt.error && attempt.data) {
        saved = attempt.data
      } else {
        const fallback = await supabase
          .from('founding_members')
          .upsert(basePayload, { onConflict: 'email' })
          .select(
            'id, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in, first_name, email',
          )
          .maybeSingle()
        saved = fallback.data
        upsertError = fallback.error
      }
    }

    if (upsertError || !saved) {
      return NextResponse.json(
        { error: upsertError?.message || 'Could not join the promotion' },
        { status: 500 },
      )
    }

    const creditSync = await syncFoundingMemberCreditsToProfile(supabase, {
      userId,
      email,
      memberId: saved.id,
    })

    return NextResponse.json({
      success: true,
      member: {
        totalCredits: saved.total_credits_earned,
        accountAwarded: saved.account_credit_awarded,
        preferencesAwarded: saved.preferences_credit_awarded,
        emailAwarded: saved.email_updates_credit_awarded,
        signupCompleted: saved.signup_completed,
        preferencesCompleted: saved.preferences_completed,
        emailUpdatesOptIn: saved.email_updates_opt_in,
        firstName: saved.first_name,
        email: saved.email,
      },
      creditsGranted: creditSync.creditsGranted,
      newBalance: creditSync.newBalance,
    })
  } catch (error: unknown) {
    console.error('founding-members/join-existing error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
