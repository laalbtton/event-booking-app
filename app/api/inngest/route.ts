import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { postEventFeedbackFunction } from '@/inngest/functions/postEventFeedback'
import { weeklyDigestFunction } from '@/inngest/functions/weeklyDigest'
import { preEventReminderFunction } from '@/inngest/functions/preEventReminder'

/**
 * Inngest serve endpoint.
 * Inngest calls this URL to deliver events and manage function state.
 * URL: https://laalbutton.com/api/inngest
 *
 * After deploying, go to Inngest dashboard → Apps and sync this URL so
 * Inngest picks up the new functions (weeklyDigest, preEventReminder).
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    postEventFeedbackFunction,
    weeklyDigestFunction,
    preEventReminderFunction,
  ],
})
