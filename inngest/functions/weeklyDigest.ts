/**
 * Inngest function: Weekly community digest
 *
 * Fires every Sunday at 9 am UTC via a built-in cron trigger.
 * If there are no upcoming events across any community, the function
 * completes silently without sending any emails.
 */

import { inngest } from '@/lib/inngest'
import { sendWeeklyDigest } from '@/lib/server/weeklyDigest'

export const weeklyDigestFunction = inngest.createFunction(
  {
    id: 'weekly-digest',
    triggers: [
      { cron: '0 9 * * 0' }, // Every Sunday at 09:00 UTC
    ],
    // Prevent overlapping runs (e.g. if a previous Sunday run is still active)
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    const result = await step.run('send-weekly-digest', async () => {
      return sendWeeklyDigest()
    })

    logger.info('Weekly digest complete', result)
    return result
  },
)
