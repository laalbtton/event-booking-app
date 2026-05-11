import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'
import { getRegistrationOpeningEmail, sendEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { sendPushToAllUsers, sendPushToUser } from '@/lib/server/push'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

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

export async function GET() {
  try {
    const admin = getAdminClient()
    if (!admin) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const now = new Date()
    
    // Find events where registration opened since the last check (within the last 24 hours)
    // Since we run once per day, we check for events that opened in the past 24 hours
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, location, registration_opens_at')
      .not('registration_opens_at', 'is', null)
      .gte('registration_opens_at', oneDayAgo.toISOString())
      .lte('registration_opens_at', now.toISOString())

    if (eventsError) {
      console.error('Error fetching events:', eventsError)
      return NextResponse.json(
        { error: 'Failed to fetch events' },
        { status: 500 }
      )
    }

    const eventsToProcess = events ?? []
    let processed = 0

    for (const event of eventsToProcess) {
      // Find all users who requested alerts for this event
      const { data: alerts, error: alertsError } = await supabase
        .from('registration_alerts')
        .select('user_id, id')
        .eq('event_id', event.id)
        .eq('notified', false)

      if (alertsError) {
        console.error(`Error fetching alerts for event ${event.id}:`, alertsError)
        continue
      }

      if (!alerts || alerts.length === 0) {
        continue
      }

      // Process each alert
      for (const alert of alerts) {
        try {
          // Get user profile
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('email, full_name')
            .eq('id', alert.user_id)
            .single()

          if (profileError || !profile) {
            console.error(`Error fetching profile for user ${alert.user_id}:`, profileError)
            continue
          }

          const eventUrl = `${(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://www.laalbutton.com').replace(/\/$/, '')}/events/${event.id}`

          // Create in-app notification
          await createNotification(
            alert.user_id,
            'general',
            '🎉 Registration Now Open!',
            `Registration for "${event.title}" is now open. Book your spot now!`,
            null,
            event.id
          )

          // Send email notification
          const html = getRegistrationOpeningEmail({
            userName: profile.full_name || 'there',
            eventTitle: event.title,
            eventDate: formatDateTimeEastern(event.date),
            eventLocation: event.location || 'TBD',
            eventUrl,
          })

          // Send email notification
          const emailSent = await sendEmail({
            to: profile.email,
            subject: `🎉 Registration Now Open: ${event.title}`,
            html,
          })

          if (!emailSent) {
            console.error(`Failed to send email to ${profile.email} for event ${event.id}`)
          }

          try {
            await sendPushToUser(admin, alert.user_id, {
              title: 'Registration Now Open',
              body: `Registration for "${event.title}" is now open.`,
              data: { url: `/events/${event.id}` },
            }, 'new_events')
          } catch (pushError) {
            // Push should not block in-app/email delivery.
            console.warn(`Push send failed for user ${alert.user_id}:`, pushError)
          }

          // Mark alert as notified
          await supabase
            .from('registration_alerts')
            .update({ notified: true })
            .eq('id', alert.id)

          processed++
        } catch (error) {
          console.error(`Error processing alert ${alert.id}:`, error)
        }
      }
    }

    // Global push: Thursday SoCap events when registration is open.
    // If registration is open at creation, this sends once shortly after creation.
    // If registration opens later, this sends once when that open window is reached.
    const { data: socapOpenCandidates, error: socapOpenCandidatesError } = await admin
      .from('events')
      .select(
        'id, title, date, location, venue_id, created_at, registration_opens_at, thursday_socap_open_push_sent_at'
      )
      .is('thursday_socap_open_push_sent_at', null)
      .lte('created_at', now.toISOString())

    if (socapOpenCandidatesError) {
      console.error('Error fetching Thursday SoCap candidates:', socapOpenCandidatesError)
    } else if (socapOpenCandidates?.length) {
      for (const event of socapOpenCandidates) {
        const registrationOpenNow =
          !event.registration_opens_at || new Date(event.registration_opens_at) <= now
        const openedRecently = event.registration_opens_at
          ? new Date(event.registration_opens_at) >= oneDayAgo &&
            new Date(event.registration_opens_at) <= now
          : new Date(event.created_at) >= oneDayAgo

        if (!registrationOpenNow || !openedRecently || !isThursday(event.date)) continue

        let venueName: string | null = null
        if (event.venue_id) {
          const { data: venue } = await admin
            .from('venues')
            .select('name')
            .eq('id', event.venue_id)
            .maybeSingle()
          venueName = venue?.name ?? null
        }

        if (!isSocapName(venueName) && !isSocapName(event.location)) continue

        try {
          await sendPushToAllUsers(
            admin,
            {
              title: 'Thursday SoCap registration is open',
              body: `"${event.title}" is now open for registration.`,
              data: { url: `/events/${event.id}` },
            },
            'new_events'
          )

          await admin
            .from('events')
            .update({ thursday_socap_open_push_sent_at: now.toISOString() })
            .eq('id', event.id)
        } catch (error) {
          console.error(`Error sending Thursday SoCap open push for event ${event.id}:`, error)
        }
      }
    }

    return NextResponse.json({ 
      message: 'Registration opening notifications processed',
      processed,
      events: eventsToProcess.length
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    console.error('Error in check-registration-opens:', error)
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
