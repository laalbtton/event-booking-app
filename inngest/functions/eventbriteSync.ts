/**
 * Inngest function: Eventbrite sync
 *
 * Runs every 6 hours to pull new/updated events from the Laal Button
 * Eventbrite organization into the Supabase events table.
 *
 * Required env vars: EVENTBRITE_API_KEY, EVENTBRITE_ORG_ID
 */

import { inngest } from '@/lib/inngest'
import { syncEventbriteEvents } from '@/lib/server/eventbriteSync'

export const eventbriteSyncFunction = inngest.createFunction(
  {
    id: 'eventbrite-sync',
    triggers: [
      { cron: '0 */6 * * *' }, // every 6 hours
    ],
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    const result = await step.run('sync-eventbrite-events', () => syncEventbriteEvents())

    if (result.errors.length > 0) {
      logger.warn('Eventbrite sync completed with errors', result)
    } else {
      logger.info('Eventbrite sync completed', result)
    }

    return result
  },
)
