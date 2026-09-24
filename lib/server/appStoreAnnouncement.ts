import { getAppStoresAnnouncementEmail } from '@/lib/email'
import { getMissingBroadcastConfig, sendBroadcast } from '@/lib/server/resendAudience'

export async function sendAppStoresAnnouncementBroadcast(): Promise<{
  broadcastId: string | null
  skipped: boolean
  error?: string
}> {
  const missingConfig = getMissingBroadcastConfig()
  if (missingConfig.length > 0) {
    const error = `Missing required env var(s): ${missingConfig.join(', ')}.`
    return { broadcastId: null, skipped: true, error }
  }

  const html = getAppStoresAnnouncementEmail()
  const broadcastId = await sendBroadcast({
    subject: 'One Mic Stand is now on the App Store and Google Play',
    html,
  })

  if (!broadcastId) {
    return {
      broadcastId: null,
      skipped: false,
      error: 'Broadcast API call failed — check server logs for [resendAudience] sendBroadcast.',
    }
  }

  return { broadcastId, skipped: false }
}
