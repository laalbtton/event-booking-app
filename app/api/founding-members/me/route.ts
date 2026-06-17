import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { normalizeEmail } from '@/lib/foundingMembers'

/**
 * Returns the founding member record for the currently authenticated user.
 * Used by the campaign page after magic-link activation to show earned
 * credits and completion status.
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

    const { data: member, error } = await supabase
      .from('founding_members')
      .select(
        'id, first_name, email, total_credits_earned, account_credit_awarded, preferences_credit_awarded, email_updates_credit_awarded, signup_completed, preferences_completed, email_updates_opt_in',
      )
      .eq('email', email)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!member) return NextResponse.json({ found: false }, { status: 200 })

    return NextResponse.json({ found: true, member })
  } catch (error: unknown) {
    console.error('founding-members/me error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
