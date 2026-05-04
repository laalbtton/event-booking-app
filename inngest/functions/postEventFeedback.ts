import { inngest } from '@/lib/inngest'
import { sendFeedbackEmailsForEvent } from '@/lib/server/postEventFeedback'
import { sendPostEventReviewPushesForEvent } from '@/lib/server/postEventReviewPush'

/**
 * Inngest function: post-event feedback emails
 *
 * Triggered by the "event/scheduled" event (fired by the Supabase webhook
 * receiver at /api/events/schedule-feedback whenever an event row is saved).
 *
 * Flow:
 *  1. Receive the event's end time
 *  2. Sleep until 1.5 hours after the event ends
 *  3. Send feedback + venue-review emails, and post-event review push prompts
 *
 * Cancellation:
 *  If an "event/cancelled" Inngest event arrives with the same eventId while
 *  this function is sleeping, Inngest will cancel it automatically before it
 *  wakes up — so no emails are sent for cancelled events.
 */
export const postEventFeedbackFunction = inngest.createFunction(
  {
    id: 'post-event-feedback',
    triggers: [{ event: 'event/scheduled' as const }],
    cancelOn: [
      {
        event: 'event/cancelled' as const,
        match: 'data.eventId',
      },
    ],
    // Retry once on transient failures (email service down, etc.)
    retries: 1,
  },
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

    const [emailResult, pushResult] = await Promise.all([
      step.run('send-feedback-emails', async () => sendFeedbackEmailsForEvent(eventId)),
      step.run('send-post-event-review-pushes', async () => sendPostEventReviewPushesForEvent(eventId)),
    ])

    return { emailResult, pushResult }
  },
)
