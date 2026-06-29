/**
 * Inngest function: Weekly community digest
 *
 * Schedule: Sunday 04:30 UTC — approximately Saturday 11:30 PM Eastern (EST).
 *
 * Sends a single Resend Broadcast to the entire audience segment instead of
 * looping over individual users.  This bypasses the transactional 100 emails/day
 * limit and falls under Resend's marketing quota (up to 1,000 contacts free).
 */

import { inngest } from '@/lib/inngest'
import { sendBroadcastWeeklyDigest } from '@/lib/server/weeklyDigest'

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
    const result = await step.run('send-broadcast-digest', () => sendBroadcastWeeklyDigest())

    if (result.skipped) {
      logger.info('Weekly digest broadcast skipped', { error: result.error })
      return { sent: false, reason: result.error ?? 'no events' }
    }

    if (!result.broadcastId) {
      logger.error('Weekly digest broadcast failed', { error: result.error })
      return { sent: false, error: result.error }
    }

    logger.info('Weekly digest broadcast sent', {
      broadcastId: result.broadcastId,
      eventCount: result.eventCount,
    })

    return {
      sent: true,
      broadcastId: result.broadcastId,
      eventCount: result.eventCount,
    }
  },
)
