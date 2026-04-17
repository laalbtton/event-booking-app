/**
 * Inngest function: 48-hour pre-event reminder
 *
 * Triggered by the Supabase webhook (app/api/events/schedule-feedback)
 * whenever an event is created or updated.
 *
 * Flow:
 *   1. Receives  event/reminder-scheduled  with { eventId, startTimeIso }
 *   2. Sleeps until  startTime − 48 hours
 *   3. Sends reminder emails to all confirmed attendees / performers
 *   4. Can be cancelled by  event/reminder-cancelled  (e.g. on event cancel)
 */

import { inngest } from '@/lib/inngest'
import { sendPreEventReminders } from '@/lib/server/preEventReminder'

export const preEventReminderFunction = inngest.createFunction(
  {
    id: 'pre-event-reminder',
    triggers: [{ event: 'event/reminder-scheduled' }],
    cancelOn: [
      {
        event: 'event/reminder-cancelled',
        match: 'data.eventId',
      },
    ],
  },
  async ({ event, step, logger }) => {
    const { eventId, startTimeIso } = event.data as {
      eventId: string
      startTimeIso: string
    }

    // Calculate send time: 48 hours before the event starts
    const sendAt = new Date(new Date(startTimeIso).getTime() - 48 * 60 * 60 * 1000).toISOString()

    // Sleep until 48h before — Inngest handles this durably
    await step.sleepUntil('wait-48h-before-event', sendAt)

    // Send reminder emails
    const result = await step.run('send-pre-event-reminders', async () => {
      return sendPreEventReminders(eventId)
    })

    logger.info('Pre-event reminder complete', { eventId, ...result })
    return result
  },
)
