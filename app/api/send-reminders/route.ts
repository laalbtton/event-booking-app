/**
 * API Route for sending event reminders
 * This can be called by a cron job or manually
 * 
 * Sends reminders for events happening in:
 * - 24 hours (1 day before)
 * - 1 hour (optional, can be enabled)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'
import { sendEventReminderEmail } from '@/lib/emailService'
import { sendPushToUser } from '@/lib/server/push'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Use service role key for server-side operations (bypasses RLS)
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: NextRequest) {
  try {
    // Optional: Add authentication/authorization check here
    // For cron jobs, you might want to check a secret token
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const now = new Date()
    const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000) // 24 hours from now
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour from now

    // Find all confirmed bookings for events happening in ~24 hours
    const { data: bookings24h, error: error24h } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        event_id,
        events (
          id,
          title,
          date,
          location
        )
      `)
      .eq('status', 'confirmed')
      .gte('events.date', now.toISOString())
      .lte('events.date', oneDayFromNow.toISOString())

    if (error24h) {
      console.error('Error fetching 24h reminders:', error24h)
      return NextResponse.json(
        { error: 'Failed to fetch bookings', details: error24h.message },
        { status: 500 }
      )
    }

    let remindersSent = 0
    let errors = []

    // Process 24-hour reminders
    if (bookings24h && bookings24h.length > 0) {
      for (const booking of bookings24h) {
        try {
          const event = booking.events as any
          if (!event) continue

          const eventDate = new Date(event.date)
          const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
          
          // Only send if between 23-25 hours (to avoid duplicates)
          if (hoursUntilEvent >= 23 && hoursUntilEvent <= 25) {
            // Check if reminder already sent (to avoid duplicates)
            const { data: existingReminder } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', booking.user_id)
              .eq('type', 'event_reminder')
              .eq('related_booking_id', booking.id)
              .gte('created_at', new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()) // Last 2 hours
              .single()

            if (existingReminder) {
              console.log(`Reminder already sent for booking ${booking.id}, skipping`)
              continue
            }

            // Calculate time until event string
            const days = Math.floor(hoursUntilEvent / 24)
            const hours = Math.floor(hoursUntilEvent % 24)
            const timeString = days > 0 ? `${days} day${days > 1 ? 's' : ''} and ${hours} hour${hours !== 1 ? 's' : ''}` : `${Math.floor(hoursUntilEvent)} hours`

            // Create in-app notification
            await createNotification(
              booking.user_id,
              'event_reminder',
              'Event Reminder 📅',
              `${event.title} is happening in ${timeString}!`,
              booking.id,
              event.id
            )

            // Send email reminder
            await sendEventReminderEmail(
              booking.user_id,
              booking.id,
              event.id,
              timeString
            )

            await sendPushToUser(supabase, booking.user_id, {
              title: 'Event Reminder',
              body: `${event.title} is happening in ${timeString}!`,
              data: { url: `/events/${event.id}` },
            }, 'event_reminders')

            remindersSent++
          }
        } catch (error: any) {
          console.error(`Error processing reminder for booking ${booking.id}:`, error)
          errors.push({ bookingId: booking.id, error: error.message })
        }
      }
    }

    // Optional: 1-hour reminders (uncomment to enable)
    /*
    const { data: bookings1h, error: error1h } = await supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        event_id,
        events (
          id,
          title,
          date,
          location
        )
      `)
      .eq('status', 'confirmed')
      .gte('events.date', now.toISOString())
      .lte('events.date', oneHourFromNow.toISOString())

    if (!error1h && bookings1h) {
      for (const booking of bookings1h) {
        try {
          const event = booking.events as any
          if (!event) continue

          const eventDate = new Date(event.date)
          const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
          
          if (hoursUntilEvent >= 0.8 && hoursUntilEvent <= 1.2) {
            // Check if reminder already sent
            const { data: existingReminder } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', booking.user_id)
              .eq('type', 'event_reminder_1h')
              .eq('related_booking_id', booking.id)
              .gte('created_at', new Date(now.getTime() - 30 * 60 * 1000).toISOString())
              .single()

            if (existingReminder) continue

            const timeString = `${Math.floor(hoursUntilEvent * 60)} minutes`

            await createNotification(
              booking.user_id,
              'event_reminder',
              'Event Starting Soon! ⏰',
              `${event.title} starts in ${timeString}!`,
              booking.id,
              event.id
            )

            await sendEventReminderEmail(
              booking.user_id,
              booking.id,
              event.id,
              timeString
            )

            remindersSent++
          }
        } catch (error: any) {
          errors.push({ bookingId: booking.id, error: error.message })
        }
      }
    }
    */

    // Host poster sharing reminders (in-app notification + push). Wider time windows support daily cron; deduped per event + type.
    let hostPosterFiveDay = 0
    let hostPosterTwentyFourHour = 0

    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)
    const { data: upcomingHostEvents, error: hostEventsError } = await supabase
      .from('events')
      .select('id, title, date, host_user_id, created_by, status')
      .gte('date', now.toISOString())
      .lte('date', twoWeeksAhead.toISOString())
      .not('status', 'in', '("cancelled","archived","draft","private","pending_approval")')

    if (!hostEventsError && upcomingHostEvents?.length) {
      for (const ev of upcomingHostEvents) {
        const hostId = (ev.host_user_id as string | null) || (ev.created_by as string | null)
        if (!hostId) continue

        const eventDate = new Date(ev.date as string)
        if (Number.isNaN(eventDate.getTime())) continue
        const hoursUntil = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)

        const sendHostPosterReminder = async (
          type: 'host_poster_reminder_5d' | 'host_poster_reminder_24h',
          bucket: 'five' | 'dayBefore'
        ) => {
          const { data: existing } = await supabase
            .from('notifications')
            .select('id')
            .eq('user_id', hostId)
            .eq('related_event_id', ev.id)
            .eq('type', type)
            .maybeSingle()

          if (existing) return

          const title =
            type === 'host_poster_reminder_5d'
              ? 'Time to share your event poster'
              : 'Share your event poster'
          const message =
            type === 'host_poster_reminder_5d'
              ? `"${ev.title}" is about five days away. Share your event poster to build attendance.`
              : `"${ev.title}" is about a day away. Share your event poster again so it stays top of mind.`

          const { error: insErr } = await supabase.from('notifications').insert({
            user_id: hostId,
            type,
            title,
            message,
            related_event_id: ev.id,
            related_booking_id: null,
          })

          if (insErr) {
            console.error('host poster reminder insert:', insErr)
            return
          }

          try {
            await sendPushToUser(
              supabase,
              hostId,
              {
                title,
                body: message,
                data: { url: `/events/${ev.id}/hosting-info` },
              },
              'event_reminders'
            )
          } catch (pushErr) {
            console.error('host poster push:', pushErr)
          }

          if (bucket === 'five') hostPosterFiveDay += 1
          else hostPosterTwentyFourHour += 1
        }

        if (hoursUntil >= 100 && hoursUntil <= 150) {
          await sendHostPosterReminder('host_poster_reminder_5d', 'five')
        }
        if (hoursUntil >= 18 && hoursUntil <= 36) {
          await sendHostPosterReminder('host_poster_reminder_24h', 'dayBefore')
        }
      }
    } else if (hostEventsError) {
      console.error('host poster events query:', hostEventsError)
    }

    return NextResponse.json({
      success: true,
      remindersSent,
      hostPosterReminders: {
        fiveDay: hostPosterFiveDay,
        twentyFourHour: hostPosterTwentyFourHour,
      },
      errors: errors.length > 0 ? errors : undefined,
      message: `Sent ${remindersSent} attendee reminder${remindersSent !== 1 ? 's' : ''}; ${hostPosterFiveDay + hostPosterTwentyFourHour} host poster nudge(s)`,
    })
  } catch (error: any) {
    console.error('Error in send-reminders route:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
