import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { normalizeEmail } from '@/lib/foundingMembers'
import { syncFoundingMemberCreditsToProfile } from '@/lib/server/syncFoundingMemberCredits'

/**
 * Force-sync Brampton Comedy Insider campaign credits onto the logged-in
 * user's profile. Safe to call repeatedly (ledger-based idempotency).
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

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, email')
      .eq('id', userId)
      .maybeSingle()

    if (profile?.role !== 'audience') {
      return NextResponse.json(
        { error: 'Insider credits are available to audience members only.' },
        { status: 403 },
      )
    }

    const profileEmail = profile?.email ? normalizeEmail(profile.email) : ''
    const creditSync = await syncFoundingMemberCreditsToProfile(supabase, {
      userId,
      email: email || profileEmail,
    })

    // If auth email miss, retry with profile email explicitly.
    const finalSync =
      !creditSync.matched && profileEmail && profileEmail !== email
        ? await syncFoundingMemberCreditsToProfile(supabase, {
            userId,
            email: profileEmail,
          })
        : creditSync

    return NextResponse.json({
      success: true,
      searchedEmails: [email, profileEmail].filter(Boolean),
      ...finalSync,
    })
  } catch (error: unknown) {
    console.error('founding-members/sync-credits error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
