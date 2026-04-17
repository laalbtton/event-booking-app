import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest'
import { postEventFeedbackFunction } from '@/inngest/functions/postEventFeedback'

/**
 * Inngest serve endpoint.
 * Inngest calls this URL to deliver events and manage function state.
 * URL: https://your-app.vercel.app/api/inngest
 *
 * Register this URL in the Inngest dashboard under Apps → Add App.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [postEventFeedbackFunction],
})
