import { NextRequest, NextResponse } from 'next/server'
import { enqueuePosterAutopostJobs } from '@/lib/posterAutopost'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { buildDefaultPosterCaption, sanitizePosterCaption } from '@/lib/posterCaption'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { eventId, posterUrl, posterCaption, action } = await request.json()
    if (!eventId || (action !== 'set' && action !== 'remove')) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const { data: eventRow, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, location, event_type, theme, languages, tickets_enabled, external_event, external_ticket_url, credits_required, created_by, host_user_id')
      .eq('id', eventId)
      .single()

    if (eventError || !eventRow) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const { data: adminLink } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    const canManage =
      profile?.role === 'admin' ||
      !!adminLink ||
      eventRow.created_by === user.id ||
      eventRow.host_user_id === user.id

    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (action === 'remove') {
      const { error: updateError } = await supabase
        .from('events')
        .update({
          poster_url: null,
          poster_caption: null,
          poster_updated_at: new Date().toISOString(),
        })
        .eq('id', eventId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, jobs: { totalAttendees: 0, jobsQueued: 0, jobsSkipped: 0 } })
    }

    if (!posterUrl) {
      return NextResponse.json({ error: 'posterUrl is required' }, { status: 400 })
    }

    const posterUpdatedAt = new Date().toISOString()
    const captionValue =
      sanitizePosterCaption(posterCaption) ||
      buildDefaultPosterCaption({
        title: eventRow.title,
        date: (eventRow as any).date,
        location: (eventRow as any).location,
        event_type: (eventRow as any).event_type,
        theme: (eventRow as any).theme,
        languages: (eventRow as any).languages,
        tickets_enabled: (eventRow as any).tickets_enabled,
        external_event: (eventRow as any).external_event,
        external_ticket_url: (eventRow as any).external_ticket_url,
        credits_required: (eventRow as any).credits_required,
      })

    const { error: updateError } = await supabase
      .from('events')
      .update({
        poster_url: posterUrl,
        poster_caption: captionValue,
        poster_updated_at: posterUpdatedAt,
      })
      .eq('id', eventId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.from('poster_publish_history').insert({
      event_id: eventId,
      poster_url: posterUrl,
      poster_caption: captionValue,
      published_by: user.id,
      published_at: posterUpdatedAt,
    })

    const jobs = await enqueuePosterAutopostJobs(supabase as any, {
      eventId,
      posterUrl,
      posterCaption: captionValue,
      posterUpdatedAt,
    })

    // Notify attendees that a poster is available.
    const { data: attendeeRows } = await supabase
      .from('bookings')
      .select('user_id')
      .eq('event_id', eventId)
      .in('status', ['confirmed', 'waitlist'])

    const attendeeIds = Array.from(new Set((attendeeRows || []).map((row: any) => row.user_id).filter(Boolean)))
    if (attendeeIds.length > 0) {
      await supabase.from('notifications').insert(
        attendeeIds.map((userId) => ({
          user_id: userId,
          type: 'general',
          title: 'New event poster available',
          message: `A new poster was published for "${eventRow.title}".`,
          related_event_id: eventId,
        }))
      )
    }

    return NextResponse.json({ success: true, jobs })
  } catch (error: any) {
    console.error('Error updating poster:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
