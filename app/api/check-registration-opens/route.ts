import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createNotification } from '@/lib/notifications'
import { getRegistrationOpeningEmail, sendEmail } from '@/lib/email'
import { formatDateTime } from '@/lib/dateUtils'
import { sendPushToUser } from '@/lib/server/push'

export async function GET(request: NextRequest) {
  try {
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

    if (!events || events.length === 0) {
      return NextResponse.json({ 
        message: 'No events with registration opening now',
        processed: 0 
      })
    }

    let processed = 0

    for (const event of events) {
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

          const eventUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.laalbutton.com'}/events/${event.id}`

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
            eventDate: formatDateTime(event.date),
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
            await sendPushToUser(supabase as any, alert.user_id, {
              title: 'Registration Now Open',
              body: `Registration for "${event.title}" is now open.`,
              data: { url: `/events/${event.id}` },
            })
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

    return NextResponse.json({ 
      message: 'Registration opening notifications processed',
      processed,
      events: events.length
    })
  } catch (error: any) {
    console.error('Error in check-registration-opens:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
