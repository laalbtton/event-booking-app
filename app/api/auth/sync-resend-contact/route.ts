/**
 * POST /api/auth/sync-resend-contact
 *
 * Called server-side after a user completes sign-up (onboarding role page).
 * Adds/updates the user in the Resend audience segment so they receive the
 * weekly marketing broadcast.
 *
 * Body: { userId: string }   — the Supabase auth user id
 *
 * Uses the service-role client so it can read any profile regardless of RLS.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { upsertContact } from '@/lib/server/resendAudience'

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const userId = typeof body.userId === 'string' ? body.userId : null

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    const supabase = getAdminSupabase()
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single()

    if (error || !profile?.email) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Extract first name from full_name (take the first word).
    const firstName = profile.full_name?.split(' ')[0] ?? undefined

    const result = await upsertContact(profile.email, firstName)
    if (!result.success) {
      // Don't fail the request — this must never block onboarding — but do
      // report the real outcome instead of a hardcoded `success: true` that
      // would mask a broken Resend integration (missing env vars, bad
      // segment id, rate limiting, etc.).
      console.error(`[sync-resend-contact] upsertContact failed for user ${userId}:`, result.error)
      return NextResponse.json({ success: false, error: result.error })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sync-resend-contact]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
