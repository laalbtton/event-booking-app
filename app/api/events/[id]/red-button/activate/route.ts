/**
 * POST /api/events/[id]/red-button/activate
 *
 * Host-only. Starts a Red Button Promo session for the event.
 * Generates a random 2-digit number (11-99) and stores it server-side.
 * Returns the secret code ONLY to the host — it is never sent to attendees.
 *
 * Auth: Bearer <user JWT>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: eventId } = await params
    const supabase = getAdminClient()

    // Authenticate
    const authHeader = request.headers.get('authorization') ?? ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = authData.user.id

    // Verify caller is the event host
    const { data: event } = await supabase
      .from('events')
      .select('id, host_user_id, title')
      .eq('id', eventId)
      .single()

    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle()
    if (event.host_user_id !== userId && !adminRow) {
      return NextResponse.json({ error: 'Only the event host can activate the Red Button' }, { status: 403 })
    }

    // Deactivate any existing active session first (safety)
    await supabase
      .from('red_button_sessions')
      .update({ active: false, deactivated_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('active', true)

    // Generate the secret code 11-99
    const secretCode = Math.floor(Math.random() * 89) + 11

    const { data: session, error: insertError } = await supabase
      .from('red_button_sessions')
      .insert({
        event_id: eventId,
        host_user_id: userId,
        secret_code: secretCode,
        active: true,
      })
      .select('id')
      .single()

    if (insertError || !session) {
      console.error('[red-button/activate]', insertError)
      return NextResponse.json({ error: 'Failed to start session' }, { status: 500 })
    }

    return NextResponse.json({ sessionId: session.id, code: secretCode })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[red-button/activate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
