import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { normalizeEmail } from '@/lib/foundingMembers'
import { syncFoundingMemberCreditsToProfile } from '@/lib/server/syncFoundingMemberCredits'

/**
 * Returns the founding member record for the currently authenticated user.
 * Also backfills any unsynced campaign credits onto their profile (idempotent),
 * so users who completed the survey before a sync bug still get paid out.
 */
export async function GET(request: NextRequest) {
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

    const email = normalizeEmail(authData.user.email)
    const userId = authData.user.id

    const { data: member, error } = await supabase
      .from('founding_members')
      .select(
        'id, first_name, email, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
      )
      .eq('email', email)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let resolved = member
    if (!resolved) {
      try {
        const { data: byUser } = await supabase
          .from('founding_members')
          .select(
            'id, first_name, email, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
          )
          .eq('profile_user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        resolved = byUser
      } catch {
        // profile_user_id column may not exist yet
      }
    }

    if (!resolved) {
      const { data: fuzzy } = await supabase
        .from('founding_members')
        .select(
          'id, first_name, email, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
        )
        .ilike('email', email)
        .limit(1)
        .maybeSingle()
      resolved = fuzzy
    }

    if (!resolved) return NextResponse.json({ found: false }, { status: 200 })

    // Repair path: grant any earned-but-unsynced campaign credits.
    const creditSync = await syncFoundingMemberCreditsToProfile(supabase, {
      userId,
      email: normalizeEmail(resolved.email),
      memberId: resolved.id,
    })

    return NextResponse.json({
      found: true,
      member: resolved,
      creditsGranted: creditSync?.creditsGranted ?? 0,
      newBalance: creditSync?.newBalance ?? null,
      syncError: creditSync?.error ?? null,
    })
  } catch (error: unknown) {
    console.error('founding-members/me error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
