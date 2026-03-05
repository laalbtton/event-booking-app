import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

function getEffectivePenaltySettings(event: {
  credits_required: number | null
  no_show_penalty_enabled: boolean | null
  no_show_penalty_credits: number | null
}) {
  const isFreeEvent = Number(event.credits_required || 0) <= 0
  const enabled = event.no_show_penalty_enabled ?? isFreeEvent
  const penaltyCredits = Math.max(0, Number(event.no_show_penalty_credits ?? 5))
  return { enabled, penaltyCredits, isFreeEvent }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authData.user.id)
      .single()
    if (profileError || !profile) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, end_time, credits_required, no_show_penalty_enabled, no_show_penalty_credits, created_by, host_user_id')
      .eq('id', eventId)
      .single()
    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const canUpdate =
      profile.role === 'admin' ||
      (profile.role === 'event_creator' && event.created_by === authData.user.id) ||
      event.host_user_id === authData.user.id
    if (!canUpdate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const eventEnd = new Date(event.end_time || event.date)
    if (Number.isNaN(eventEnd.getTime()) || eventEnd > new Date()) {
      return NextResponse.json({ error: 'No-show penalties can only be processed after event end time' }, { status: 400 })
    }

    const { enabled, penaltyCredits, isFreeEvent } = getEffectivePenaltySettings({
      credits_required: event.credits_required,
      no_show_penalty_enabled: event.no_show_penalty_enabled,
      no_show_penalty_credits: event.no_show_penalty_credits,
    })

    if (!isFreeEvent || !enabled || penaltyCredits <= 0) {
      return NextResponse.json({
        success: true,
        charged: 0,
        message: 'No-show penalty policy is not active for this event.',
      })
    }

    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, user_id, credits_used, attendance_status, no_show_penalty_charged_at')
      .eq('event_id', eventId)
      .eq('status', 'confirmed')
      .eq('booking_scope', 'performer')
      .is('no_show_penalty_charged_at', null)
    if (bookingsError) {
      return NextResponse.json({ error: bookingsError.message }, { status: 500 })
    }

    let charged = 0
    let skipped = 0
    const nowIso = new Date().toISOString()

    for (const booking of bookings || []) {
      if (String(booking.attendance_status || '') === 'attended') {
        skipped += 1
        continue
      }
      if (Number(booking.credits_used || 0) > 0) {
        skipped += 1
        continue
      }

      const { data: attendeeProfile, error: profileLoadError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', booking.user_id)
        .single()
      if (profileLoadError || !attendeeProfile) {
        skipped += 1
        continue
      }

      const nextCredits = Number(attendeeProfile.credits || 0) - penaltyCredits
      const { error: creditsError } = await supabase
        .from('profiles')
        .update({ credits: nextCredits, updated_at: nowIso })
        .eq('id', booking.user_id)
      if (creditsError) {
        skipped += 1
        continue
      }

      await supabase
        .from('bookings')
        .update({
          attendance_status: 'no_show',
          attendance_marked_at: nowIso,
          no_show_penalty_charged_at: nowIso,
          no_show_penalty_credits: penaltyCredits,
        })
        .eq('id', booking.id)

      await supabase.from('credit_transactions').insert({
        user_id: booking.user_id,
        amount: -penaltyCredits,
        transaction_type: 'no_show_penalty',
        reference_id: booking.id,
        notes: `No-show penalty charged for "${event.title}"`,
      })

      await supabase.rpc('create_notification', {
        p_user_id: booking.user_id,
        p_type: 'general',
        p_title: 'No-show penalty applied',
        p_message: `You were marked as a no-show for "${event.title}". ${penaltyCredits} credit${penaltyCredits > 1 ? 's were' : ' was'} charged to your account.`,
        p_related_booking_id: booking.id,
        p_related_event_id: eventId,
      })

      charged += 1
    }

    return NextResponse.json({
      success: true,
      charged,
      skipped,
      penaltyCredits,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
