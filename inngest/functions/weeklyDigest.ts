/**
 * Inngest function: Weekly community digest
 *
 * Schedule: Sunday 04:30 UTC — approximately Saturday 11:30 PM Eastern (EST).
 * During EDT this is one hour earlier in local time; adjust cron if you need
 * an exact local wall clock year-round.
 *
 * Sends in batches (default 100 emails), then step.sleep(24h) before the next
 * batch, up to WEEKLY_DIGEST_MAX_BATCHES (default 5) = 500 users per week.
 * Recipients are sorted by user id so each person stays in the same batch
 * every week (consistent day/time for that subscriber).
 */

import { inngest } from '@/lib/inngest'
import { deliverWeeklyDigestBatch, prepareWeeklyDigest } from '@/lib/server/weeklyDigest'

export const weeklyDigestFunction = inngest.createFunction(
  {
    id: 'weekly-digest',
    triggers: [
      // Sunday 04:30 UTC ≈ Saturday 11:30 PM EST
      { cron: '30 4 * * 0' },
    ],
    concurrency: { limit: 1 },
  },
  async ({ step, logger }) => {
    const prepared = await step.run('prepare-weekly-digest', async () => prepareWeeklyDigest())

    if (!prepared || prepared.items.length === 0) {
      logger.info('Weekly digest: nothing to send')
      return { emailsSent: 0, batches: 0, overflow: 0 }
    }

    const BATCH = Number(process.env.WEEKLY_DIGEST_BATCH_SIZE || 100)
    const MAX_BATCHES = Number(process.env.WEEKLY_DIGEST_MAX_BATCHES || 5)

    let totalSent = 0
    const allErrors: string[] = []
    let batchCount = 0

    for (let b = 0; b < MAX_BATCHES; b++) {
      const start = b * BATCH
      if (start >= prepared.items.length) break

      const end = Math.min(start + BATCH, prepared.items.length)

      const result = await step.run(`weekly-digest-batch-${b}`, async () =>
        deliverWeeklyDigestBatch(prepared, start, end),
      )

      totalSent += result.emailsSent
      allErrors.push(...result.errors)
      batchCount++

      if (end >= prepared.items.length) break

      await step.sleep(`weekly-digest-wait-${b}`, '24h')
    }

    if (prepared.overflowCount > 0) {
      logger.warn(`Weekly digest: ${prepared.overflowCount} users skipped (over weekly cap)`)
    }

    logger.info('Weekly digest complete', {
      emailsSent: totalSent,
      batches: batchCount,
      errorCount: allErrors.length,
      overflow: prepared.overflowCount,
    })

    return {
      emailsSent: totalSent,
      batches: batchCount,
      errors: allErrors,
      overflow: prepared.overflowCount,
    }
  },
)
