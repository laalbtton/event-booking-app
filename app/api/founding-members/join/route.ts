import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import {
  computeTotalCredits,
  isValidEmail,
  normalizeEmail,
} from '@/lib/foundingMembers'

/**
 * Step 1 — account creation for the Brampton Comedy Insider campaign.
 * Anonymous public endpoint: persists the lead keyed by email, marks the
 * magic-link as sent, and awards the account ($5) + email-updates ($5) credits.
 * Credit awards are idempotent (guarded by boolean flags).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : ''
    const emailRaw = typeof body?.email === 'string' ? body.email : ''
    const emailUpdatesOptIn = body?.emailUpdatesOptIn === true

    if (!firstName) {
      return NextResponse.json({ error: 'First name is required' }, { status: 400 })
    }
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const email = normalizeEmail(emailRaw)
    const nowIso = new Date().toISOString()

    const { data: existing } = await supabase
      .from('founding_members')
      .select(
        'id, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, whatsapp_credit_awarded, app_credit_awarded, signup_completed, preferences_completed',
      )
      .eq('email', email)
      .maybeSingle()

    const flags = {
      account_credit_awarded: true, // creating account / initiating magic link
      preferences_credit_awarded: existing?.preferences_credit_awarded ?? false,
      // Once awarded, don't claw back even if they later untick the box.
      email_updates_credit_awarded:
        existing?.email_updates_credit_awarded || emailUpdatesOptIn,
      whatsapp_credit_awarded: existing?.whatsapp_credit_awarded ?? false,
      app_credit_awarded: existing?.app_credit_awarded ?? false,
    }

    const totalCredits = computeTotalCredits(flags)

    const payload = {
      first_name: firstName,
      email,
      email_updates_opt_in: emailUpdatesOptIn,
      magic_link_sent_at: nowIso,
      total_credits_earned: totalCredits,
      ...flags,
    }

    const { data: saved, error: upsertError } = await supabase
      .from('founding_members')
      .upsert(payload, { onConflict: 'email' })
      .select(
        'id, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
      )
      .maybeSingle()

    if (upsertError || !saved) {
      return NextResponse.json(
        { error: upsertError?.message || 'Could not save your spot' },
        { status: 500 },
      )
    }

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
      },
    })
  } catch (error: unknown) {
    console.error('founding-members/join error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
