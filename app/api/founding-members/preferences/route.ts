import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import {
  AGE_RANGES,
  CANADA_STATUSES,
  CITIES,
  COMEDY_PREFERENCES,
  DOWNTOWN_INTEREST,
  TICKET_PRICE_RANGES,
  computeTotalCredits,
  isValidEmail,
  normalizeEmail,
} from '@/lib/foundingMembers'
import { syncFoundingMemberCreditsByEmail } from '@/lib/server/syncFoundingMemberCredits'

function pickOption<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null
}

function filterMulti<T extends string>(value: unknown, allowed: readonly T[]): T[] {
  if (!Array.isArray(value)) return []
  const set = new Set(allowed as readonly string[])
  return [...new Set(value.filter((v): v is T => typeof v === 'string' && set.has(v)))]
}

/**
 * Step 2 — preferences for the Brampton Comedy Insider campaign.
 * Updates the lead by email, marks preferences complete, and awards the
 * preferences credit ($15) once.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const emailRaw = typeof body?.email === 'string' ? body.email : ''
    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    const email = normalizeEmail(emailRaw)

    const { data: existing, error: findError } = await supabase
      .from('founding_members')
      .select(
        'id, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, whatsapp_credit_awarded, app_credit_awarded',
      )
      .eq('email', email)
      .maybeSingle()

    if (findError) {
      return NextResponse.json({ error: findError.message }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json(
        { error: 'Please create your account first.' },
        { status: 404 },
      )
    }

    const flags = {
      account_credit_awarded: existing.account_credit_awarded ?? true,
      preferences_credit_awarded: true,
      email_updates_credit_awarded: existing.email_updates_credit_awarded ?? false,
      whatsapp_credit_awarded: existing.whatsapp_credit_awarded ?? false,
      app_credit_awarded: existing.app_credit_awarded ?? false,
    }
    const totalCredits = computeTotalCredits(flags)

    const { data: saved, error: updateError } = await supabase
      .from('founding_members')
      .update({
        age_range: pickOption(body?.ageRange, AGE_RANGES),
        canada_status: pickOption(body?.canadaStatus, CANADA_STATUSES),
        city: pickOption(body?.city, CITIES),
        downtown_brampton_interest: pickOption(body?.downtownBramptonInterest, DOWNTOWN_INTEREST),
        comedy_preferences: filterMulti(body?.comedyPreferences, COMEDY_PREFERENCES),
        ticket_price_range: pickOption(body?.ticketPriceRange, TICKET_PRICE_RANGES),
        favorite_comedians:
          typeof body?.favoriteComedians === 'string'
            ? body.favoriteComedians.trim().slice(0, 2000) || null
            : null,
        preferences_completed: true,
        total_credits_earned: totalCredits,
        ...flags,
      })
      .eq('id', existing.id)
      .select('total_credits_earned, preferences_completed, signup_completed')
      .maybeSingle()

    if (updateError || !saved) {
      return NextResponse.json(
        { error: updateError?.message || 'Could not save your preferences' },
        { status: 500 },
      )
    }

    // If the user already activated their account, sync any new credits to their profile.
    const creditSync = await syncFoundingMemberCreditsByEmail(supabase, email)

    return NextResponse.json({
      success: true,
      member: {
        totalCredits: saved.total_credits_earned,
        preferencesCompleted: saved.preferences_completed,
        signupCompleted: saved.signup_completed,
        creditsSynced: creditSync.synced,
        creditsGranted: creditSync.creditsGranted,
      },
    })
  } catch (error: unknown) {
    console.error('founding-members/preferences error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
