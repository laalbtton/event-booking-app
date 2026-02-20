import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { exchangeForLongLivedUserToken, resolveInstagramPageToken } from '@/lib/server/instagramAuth'

const MAX_ATTEMPTS = 3
const BATCH_SIZE = 20

async function postToInstagram(igAccountId: string, accessToken: string, imageUrl: string, caption: string | null) {
  const mediaUrl = new URL(`https://graph.facebook.com/v21.0/${igAccountId}/media`)
  mediaUrl.searchParams.set('image_url', imageUrl)
  mediaUrl.searchParams.set('access_token', accessToken)
  if (caption) mediaUrl.searchParams.set('caption', caption)

  const mediaResponse = await fetch(mediaUrl.toString(), { method: 'POST', cache: 'no-store' })
  const mediaResult = await mediaResponse.json().catch(() => ({}))
  if (!mediaResponse.ok || !mediaResult?.id) {
    throw new Error(mediaResult?.error?.message || 'Failed to create instagram media container')
  }

  const publishUrl = new URL(`https://graph.facebook.com/v21.0/${igAccountId}/media_publish`)
  publishUrl.searchParams.set('creation_id', mediaResult.id)
  publishUrl.searchParams.set('access_token', accessToken)
  const publishResponse = await fetch(publishUrl.toString(), { method: 'POST', cache: 'no-store' })
  const publishResult = await publishResponse.json().catch(() => ({}))
  if (!publishResponse.ok || !publishResult?.id) {
    throw new Error(publishResult?.error?.message || 'Failed to publish instagram media')
  }

  return publishResult
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET
    const authHeader = request.headers.get('authorization')
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase server environment variables' }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const { data: jobs, error: jobsError } = await supabase
      .from('social_post_jobs')
      .select('id, user_id, event_id, provider, poster_url, poster_caption, attempt_count')
      .eq('status', 'pending')
      .lte('scheduled_for', nowIso)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (jobsError) {
      return NextResponse.json({ error: jobsError.message }, { status: 500 })
    }

    let processed = 0
    let posted = 0
    let failed = 0
    let skipped = 0

    for (const job of jobs || []) {
      processed += 1
      const nextAttempt = Number(job.attempt_count || 0) + 1

      await supabase
        .from('social_post_jobs')
        .update({ status: 'processing', attempt_count: nextAttempt, updated_at: new Date().toISOString() })
        .eq('id', job.id)

      try {
        const { data: eventRow } = await supabase
          .from('events')
          .select('created_by, host_user_id, title')
          .eq('id', job.event_id)
          .maybeSingle()
        const hostIds = Array.from(
          new Set([eventRow?.created_by, eventRow?.host_user_id].filter((value): value is string => !!value))
        )

        const { data: account } = await supabase
          .from('social_accounts')
          .select('id, external_account_id, access_token, refresh_token, expires_at, is_active')
          .eq('user_id', job.user_id)
          .eq('provider', 'instagram')
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!account?.external_account_id || !account?.access_token) {
          skipped += 1
          await supabase.from('social_post_attempts').insert({
            job_id: job.id,
            attempt_number: nextAttempt,
            status: 'skipped',
            error_message: 'No active Instagram account',
          })
          await supabase
            .from('social_post_jobs')
            .update({
              status: 'skipped',
              last_error: 'No active Instagram account',
              processed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', job.id)
          continue
        }

        let igAccountId = account.external_account_id
        let pageAccessToken = account.access_token
        const expiresAtMs = account.expires_at ? new Date(account.expires_at).getTime() : null
        const needsRefresh = !!(expiresAtMs && expiresAtMs <= Date.now() + 5 * 60 * 1000)

        if (needsRefresh && account.refresh_token) {
          const refreshed = await exchangeForLongLivedUserToken(account.refresh_token)
          if (!refreshed?.accessToken) {
            throw new Error('Instagram token expired and refresh failed')
          }
          const resolved = await resolveInstagramPageToken(refreshed.accessToken)
          if (!resolved?.instagramAccountId || !resolved?.pageAccessToken) {
            throw new Error('Instagram token refresh resolved no business account')
          }

          igAccountId = resolved.instagramAccountId
          pageAccessToken = resolved.pageAccessToken

          await supabase
            .from('social_accounts')
            .update({
              external_account_id: resolved.instagramAccountId,
              account_username: resolved.username,
              access_token: resolved.pageAccessToken,
              refresh_token: refreshed.accessToken,
              expires_at: refreshed.expiresAt,
              metadata: {
                page_id: resolved.pageId,
                page_name: resolved.pageName,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', account.id)
        }

        const publishResult = await postToInstagram(
          igAccountId,
          pageAccessToken,
          job.poster_url,
          job.poster_caption
        )

        posted += 1
        await supabase.from('social_post_attempts').insert({
          job_id: job.id,
          attempt_number: nextAttempt,
          status: 'posted',
          provider_response: publishResult,
        })
        await supabase
          .from('social_post_jobs')
          .update({
            status: 'posted',
            last_error: null,
            processed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        await supabase.from('notifications').insert({
          user_id: job.user_id,
          type: 'general',
          title: 'Poster posted to Instagram',
          message: 'Your event poster was auto-posted successfully.',
          related_event_id: job.event_id,
        })
        if (hostIds.length > 0) {
          await supabase.from('notifications').insert(
            hostIds.map((hostId) => ({
              user_id: hostId,
              type: 'general',
              title: 'Poster auto-post succeeded',
              message: `A poster auto-post succeeded for "${eventRow?.title || 'your event'}".`,
              related_event_id: job.event_id,
            }))
          )
        }
      } catch (error: any) {
        const message = error?.message || 'Failed to auto-post poster'
        const invalidAccount =
          /no active instagram account|expired|refresh failed|no business account|invalid/i.test(message)
        const reachedMaxAttempts = nextAttempt >= MAX_ATTEMPTS
        if (invalidAccount) {
          skipped += 1
        } else {
          failed += 1
        }

        await supabase.from('social_post_attempts').insert({
          job_id: job.id,
          attempt_number: nextAttempt,
          status: invalidAccount ? 'skipped' : 'failed',
          error_message: message,
        })

        await supabase
          .from('social_post_jobs')
          .update({
            status: invalidAccount ? 'skipped' : reachedMaxAttempts ? 'failed' : 'pending',
            last_error: message,
            scheduled_for: invalidAccount
              ? nowIso
              : reachedMaxAttempts
              ? nowIso
              : new Date(Date.now() + nextAttempt * 5 * 60 * 1000).toISOString(),
            processed_at: invalidAccount || reachedMaxAttempts ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id)

        if (invalidAccount || reachedMaxAttempts) {
          const { data: eventRow } = await supabase
            .from('events')
            .select('created_by, host_user_id, title')
            .eq('id', job.event_id)
            .maybeSingle()
          const hostIds = Array.from(
            new Set([eventRow?.created_by, eventRow?.host_user_id].filter((value): value is string => !!value))
          )
          await supabase.from('notifications').insert({
            user_id: job.user_id,
            type: 'general',
            title: 'Poster auto-post failed',
            message: 'We could not auto-post your event poster. You can still share it manually.',
            related_event_id: job.event_id,
          })
          if (hostIds.length > 0) {
            await supabase.from('notifications').insert(
              hostIds.map((hostId) => ({
                user_id: hostId,
                type: 'general',
                title: 'Poster auto-post failed',
                message: `Auto-post failed for a booked attendee in "${eventRow?.title || 'your event'}".`,
                related_event_id: job.event_id,
              }))
            )
          }
        }
      }
    }

    return NextResponse.json({ success: true, processed, posted, failed, skipped })
  } catch (error: any) {
    console.error('Poster worker error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
