import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToAllUsers, sendPushToUser } from '@/lib/server/push'

type Scenario = 'registration_open' | 'seventy_five_full'

function isThursday(dateValue: string | null) {
  if (!dateValue) return false
  const parsed = new Date(dateValue)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getDay() === 4
}

function isSocapName(value: string | null | undefined) {
  if (!value) return false
  return value.toLowerCase().includes('socap')
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = getAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    const allowedRoles = new Set(['admin', 'event_creator'])
    if (!allowedRoles.has(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
    const scenario: Scenario =
      body?.scenario === 'seventy_five_full' ? 'seventy_five_full' : 'registration_open'
    const dryRun = body?.dryRun !== false
    const broadcast = body?.broadcast === true
    const markAsSent = body?.markAsSent === true

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const now = new Date()
    const { data: event, error: eventError } = await admin
      .from('events')
      .select(
        'id, title, date, location, venue_id, registration_opens_at, max_attendees, thursday_socap_open_push_sent_at, thursday_socap_75_push_sent_at'
      )
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    let venueName: string | null = null
    if (event.venue_id) {
      const { data: venue } = await admin.from('venues').select('name').eq('id', event.venue_id).maybeSingle()
      venueName = venue?.name ?? null
    }

    const passesThursday = isThursday(event.date)
    const passesSocap = isSocapName(venueName) || isSocapName(event.location)
    const registrationOpenNow = !event.registration_opens_at || new Date(event.registration_opens_at) <= now

    let performerConfirmedCount: number | null = null
    let seventyFiveThreshold: number | null = null
    let passesSeventyFive = true

    if (scenario === 'seventy_five_full') {
      const max = Number(event.max_attendees || 0)
      seventyFiveThreshold = max > 0 ? Math.ceil(max * 0.75) : 0
      const { count, error: countError } = await admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'confirmed')
        .eq('booking_scope', 'performer')
      if (countError) {
        return NextResponse.json({ error: 'Failed to load booking counts' }, { status: 500 })
      }
      performerConfirmedCount = count ?? 0
      passesSeventyFive = max > 0 && performerConfirmedCount >= seventyFiveThreshold
    }

    const scenarioPasses =
      scenario === 'registration_open' ? registrationOpenNow : passesSeventyFive

    const qualifies = passesThursday && passesSocap && scenarioPasses

    const payload =
      scenario === 'registration_open'
        ? {
            title: 'Thursday SoCap registration is open',
            body: `"${event.title}" is now open for registration.`,
            data: { url: `/events/${event.id}` },
          }
        : {
            title: 'Thursday SoCap is 75% full',
            body: `"${event.title}" is filling up fast - spots are almost gone.`,
            data: { url: `/events/${event.id}` },
          }

    if (dryRun || !qualifies) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        qualifies,
        checks: {
          passesThursday,
          passesSocap,
          registrationOpenNow,
          performerConfirmedCount,
          seventyFiveThreshold,
        },
        scenario,
        alreadySentAt:
          scenario === 'registration_open'
            ? event.thursday_socap_open_push_sent_at
            : event.thursday_socap_75_push_sent_at,
      })
    }

    const result = broadcast
      ? await sendPushToAllUsers(admin, payload, 'new_events')
      : await sendPushToUser(admin, user.id, payload, 'new_events')

    if (markAsSent) {
      const field =
        scenario === 'registration_open'
          ? { thursday_socap_open_push_sent_at: now.toISOString() }
          : { thursday_socap_75_push_sent_at: now.toISOString() }
      await admin.from('events').update(field).eq('id', event.id)
    }

    return NextResponse.json({
      success: true,
      dryRun: false,
      broadcast,
      qualifies,
      scenario,
      result,
      markedAsSent: markAsSent,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Thursday SoCap push test error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
