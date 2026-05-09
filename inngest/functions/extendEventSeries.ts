/**
 * Inngest function: Extend active event series
 *
 * Runs every Monday at 06:00 UTC (≈ Monday 2 AM Eastern) to push each active
 * recurring event series forward to its configured horizon_weeks limit.
 * This ensures upcoming occurrences are always pre-generated so bookings,
 * reminders, and the public event list work without any extra logic.
 */

import { inngest } from '@/lib/inngest'
import { extendAllActiveSeries } from '@/lib/server/eventSeries'

export const extendEventSeriesFunction = inngest.createFunction(
  {
    id: 'extend-event-series',
    triggers: [
      { cron: '0 6 * * 1' }, // Monday 06:00 UTC ≈ Monday 2 AM Eastern
    ],
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    const results = await step.run('extend-all-active-series', () =>
      extendAllActiveSeries()
    )

    const totalGenerated = results.reduce((sum, r) => sum + Math.max(0, r.generated), 0)
    const failed = results.filter((r) => r.generated === -1).length

    logger.info(
      `extend-event-series: processed ${results.length} series, generated ${totalGenerated} occurrences, ${failed} errors`
    )

    return { processed: results.length, totalGenerated, failed }
  }
)
