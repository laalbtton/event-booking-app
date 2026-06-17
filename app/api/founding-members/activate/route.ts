import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { normalizeEmail } from '@/lib/foundingMembers'
import { syncFoundingMemberCreditsToProfile } from '@/lib/server/syncFoundingMemberCredits'

/**
 * Called from the auth callback when a Brampton Comedy Insider user completes
 * the magic-link sign-in. Marks the founding member account as activated and
 * syncs earned campaign credits into the audience profile ledger (redeemable
 * in-app). Authenticated via Bearer token; email comes from the session.
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

    const email = normalizeEmail(authData.user.email)
    const userId = authData.user.id
    const nowIso = new Date().toISOString()

    const { data: member } = await supabase
      .from('founding_members')
      .select('first_name')
      .eq('email', email)
      .maybeSingle()

    // Campaign signups are audience-only.
    const profileUpdate: Record<string, unknown> = {
      role: 'audience',
      updated_at: nowIso,
    }
    if (member?.first_name) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle()
      if (!profile?.full_name) {
        profileUpdate.full_name = member.first_name
      }
    }
    await supabase.from('profiles').update(profileUpdate).eq('id', userId)

    const { data: updated } = await supabase
      .from('founding_members')
      .update({
        signup_completed: true,
        app_account_activated: true,
      })
      .eq('email', email)
      .select('id')
      .maybeSingle()

    const creditSync = await syncFoundingMemberCreditsToProfile(supabase, { userId, email })

    return NextResponse.json({
      success: true,
      matched: !!updated,
      creditsGranted: creditSync.creditsGranted,
      newBalance: creditSync.newBalance,
      creditsSynced: creditSync.synced,
    })
  } catch (error: unknown) {
    console.error('founding-members/activate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
