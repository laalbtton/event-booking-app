/**
 * Shared helpers for event Live Mode API routes.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export type AdminClient = SupabaseClient

export function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function authenticateBearer(
  request: NextRequest,
): Promise<{ error: NextResponse } | { error?: undefined; supabase: AdminClient; userId: string; token: string }> {
  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const supabase = getAdminClient()
  const { data: authData, error: authError } = await supabase.auth.getUser(token)
  if (authError || !authData.user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { supabase, userId: authData.user.id, token }
}

export async function isAdminUser(supabase: AdminClient, userId: string) {
  const { data } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle()
  return !!data
}

export async function loadEventAccess(
  supabase: AdminClient,
  eventId: string,
  userId: string,
): Promise<
  | { error: NextResponse }
  | {
      error?: undefined
      event: { id: string; title: string; host_user_id: string | null }
      isHost: boolean
      hasConfirmedBooking: boolean
      hasAudienceBooking: boolean
      booking: { id: string; status: string; booking_scope: string | null } | null
    }
> {
  const { data: event } = await supabase
    .from('events')
    .select('id, title, host_user_id, created_by')
    .eq('id', eventId)
    .single()

  if (!event) return { error: NextResponse.json({ error: 'Event not found' }, { status: 404 }) }

  const admin = await isAdminUser(supabase, userId)
  const isHost = event.host_user_id === userId || event.created_by === userId || admin

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, status, booking_scope')
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('status', 'confirmed')

  const hasConfirmedBooking = (bookings?.length ?? 0) > 0
  const hasAudienceBooking = (bookings || []).some((b) => b.booking_scope === 'audience')
  const booking =
    (bookings || []).find((b) => b.booking_scope === 'audience') ||
    bookings?.[0] ||
    null

  if (!isHost && !hasConfirmedBooking) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { event, isHost, hasConfirmedBooking, hasAudienceBooking, booking }
}
