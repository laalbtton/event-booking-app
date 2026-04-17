import { inngest } from '@/lib/inngest'
import { sendFeedbackEmailsForEvent } from '@/lib/server/postEventFeedback'

/**
 * Inngest function: post-event feedback emails
 *
 * Triggered by the "event/scheduled" event (fired by the Supabase webhook
 * receiver at /api/events/schedule-feedback whenever an event row is saved).
 *
 * Flow:
 *  1. Receive the event's end time
 *  2. Sleep until 1.5 hours after the event ends
 *  3. Send feedback + venue-review emails to all confirmed attendees/performers
 *
 * Cancellation:
 *  If an "event/cancelled" Inngest event arrives with the same eventId while
 *  this function is sleeping, Inngest will cancel it automatically before it
 *  wakes up — so no emails are sent for cancelled events.
 */
export const postEventFeedbackFunction = inngest.createFunction(
  {
    id: 'post-event-feedback',
    cancelOn: [
      {
        event: 'event/cancelled',
        match: 'data.eventId',
      },
    ],
    // Retry once on transient failures (email service down, etc.)
    retries: 1,
  },
  { event: 'event/scheduled' },
  async ({ event, step }) => {
    const { eventId, endTimeIso } = event.data as {
      eventId: string
      endTimeIso: string
      status: string
    }

    // Calculate target: 1.5 hours (90 minutes) after event ends
    const endTime = new Date(endTimeIso)
    const sendAt = new Date(endTime.getTime() + 90 * 60 * 1000)

    // Sleep until the right moment — Inngest persists this across restarts
    await step.sleepUntil('wait-until-post-event', sendAt)

    // Send the emails
    const result = await step.run('send-feedback-emails', async () => {
      return sendFeedbackEmailsForEvent(eventId)
    })

    return result
  },
)
