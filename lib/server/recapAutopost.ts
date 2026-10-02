import { createHash } from 'crypto'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { formatDateTime } from '@/lib/dateUtils'
import { MAX_RECAP_PHOTOS_PER_POST, recapPostReadyAt, RECAP_BUCKET } from '@/lib/recapPhotos'
import { loadInstagramAccountForUser, publishInstagramCarousel } from '@/lib/server/instagramPublish'

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>

type RecapPhotoRow = {
  id: string
  event_id: string
  storage_path: string
  public_url: string
  sort_order: number
  created_at: string
}

type RecapEventRow = {
  id: string
  title: string
  date: string
  end_time: string | null
  location: string | null
  recap_caption: string | null
  host_user_id: string | null
  created_by: string | null
}

export function buildRecapCaption(event: RecapEventRow): string {
  const custom = event.recap_caption?.trim()
  if (custom) return custom.slice(0, 2200)
  const when = formatDateTime(event.date)
  const lines = [`Photos from ${event.title}`, when]
  if (event.location) lines.push(event.location)
  return lines.filter(Boolean).join('\n')
}

export function recapIdempotencyKey(eventId: string, photoIds: string[]) {
  const digest = createHash('sha256').update(photoIds.slice().sort().join(',')).digest('hex').slice(0, 16)
  return `recap:${eventId}:${digest}`
}

async function notifyHosts(
  supabase: AdminClient,
  event: RecapEventRow,
  title: string,
  message: string
) {
  const hostIds = Array.from(new Set([event.host_user_id, event.created_by].filter((id): id is string => !!id)))
  if (hostIds.length === 0) return
  await supabase.from('notifications').insert(
    hostIds.map((userId) => ({
      user_id: userId,
      type: 'general',
      title,
      message,
      related_event_id: event.id,
    }))
  )
}

async function deleteRecapFiles(supabase: AdminClient, photos: RecapPhotoRow[]) {
  const paths = photos.map((photo) => photo.storage_path).filter(Boolean)
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(RECAP_BUCKET).remove(paths)
  if (error) {
    console.warn('Recap photo storage delete failed:', error.message)
  }
}

export async function processDueRecapCarousels(supabase: AdminClient) {
  const now = new Date()
  const nowIso = now.toISOString()
  const stuckCutoff = new Date(now.getTime() - 20 * 60 * 1000).toISOString()

  await supabase
    .from('event_recap_photos')
    .update({ status: 'pending', updated_at: nowIso })
    .eq('status', 'posting')
    .lt('updated_at', stuckCutoff)

  const { data: pendingPhotos, error: photosError } = await supabase
    .from('event_recap_photos')
    .select('id, event_id, storage_path, public_url, sort_order, created_at')
    .eq('status', 'pending')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (photosError) throw photosError

  const byEvent = new Map<string, RecapPhotoRow[]>()
  for (const photo of (pendingPhotos || []) as RecapPhotoRow[]) {
    const list = byEvent.get(photo.event_id) || []
    list.push(photo)
    byEvent.set(photo.event_id, list)
  }

  let processed = 0
  let posted = 0
  let failed = 0
  let skipped = 0
  let waiting = 0

  for (const [eventId, photos] of byEvent) {
    const batch = photos.slice(0, MAX_RECAP_PHOTOS_PER_POST)
    if (batch.length === 0) continue

    const { data: eventRow } = await supabase
      .from('events')
      .select('id, title, date, end_time, location, recap_caption, host_user_id, created_by, status')
      .eq('id', eventId)
      .maybeSingle()

    const event = eventRow as (RecapEventRow & { status?: string | null }) | null
    if (!event || event.status === 'cancelled') {
      skipped += 1
      continue
    }

    const readyAt = recapPostReadyAt(event.date, event.end_time)
    if (now < readyAt) {
      waiting += 1
      continue
    }

    const posterUserId = event.host_user_id || event.created_by
    if (!posterUserId) {
      skipped += 1
      continue
    }

    processed += 1
    const photoIds = batch.map((photo) => photo.id)
    const imageUrls = batch.map((photo) => photo.public_url)
    const caption = buildRecapCaption(event)
    const idempotencyKey = recapIdempotencyKey(eventId, photoIds)

    const { data: existingJob } = await supabase
      .from('social_post_jobs')
      .select('id, status, attempt_count')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingJob?.status === 'posted') {
      await deleteRecapFiles(supabase, batch)
      await supabase
        .from('event_recap_photos')
        .update({
          status: 'deleted',
          posted_at: nowIso,
          deleted_at: nowIso,
          public_url: '',
          updated_at: nowIso,
        })
        .in('id', photoIds)
      posted += 1
      continue
    }

    await supabase
      .from('event_recap_photos')
      .update({ status: 'posting', updated_at: nowIso })
      .in('id', photoIds)

    const nextAttempt = Number(existingJob?.attempt_count || 0) + 1
    const { data: job } = await supabase
      .from('social_post_jobs')
      .upsert(
        {
          user_id: posterUserId,
          event_id: eventId,
          provider: 'instagram',
          job_type: 'recap_carousel',
          poster_url: imageUrls[0],
          poster_caption: caption,
          payload: { photo_ids: photoIds, image_urls: imageUrls },
          status: 'processing',
          attempt_count: nextAttempt,
          last_error: null,
          scheduled_for: nowIso,
          idempotency_key: idempotencyKey,
        },
        { onConflict: 'idempotency_key' }
      )
      .select('id, attempt_count, status')
      .maybeSingle()

    try {
      const account = await loadInstagramAccountForUser(supabase, posterUserId)
      if (!account) {
        skipped += 1
        await supabase
          .from('event_recap_photos')
          .update({ status: 'pending', updated_at: nowIso })
          .in('id', photoIds)
        if (job?.id) {
          await supabase.from('social_post_attempts').insert({
            job_id: job.id,
            attempt_number: Number(job.attempt_count || nextAttempt),
            status: 'skipped',
            error_message: 'Host has no connected Instagram account',
          })
          await supabase
            .from('social_post_jobs')
            .update({
              status: 'skipped',
              last_error: 'Host has no connected Instagram account',
              processed_at: nowIso,
              updated_at: nowIso,
            })
            .eq('id', job.id)
        }
        if (existingJob?.status !== 'skipped') {
          await notifyHosts(
            supabase,
            event,
            'Recap photos waiting on Instagram',
            `Photos for "${event.title}" are ready, but Instagram is not connected. Connect Instagram in Settings to auto-post the carousel.`
          )
        }
        continue
      }

      const publishResult = await publishInstagramCarousel(
        account.igAccountId,
        account.pageAccessToken,
        imageUrls,
        caption
      )

      await deleteRecapFiles(supabase, batch)
      await supabase
        .from('event_recap_photos')
        .update({
          status: 'deleted',
          posted_at: nowIso,
          deleted_at: nowIso,
          public_url: '',
          updated_at: nowIso,
        })
        .in('id', photoIds)

      posted += 1
      if (job?.id) {
        await supabase.from('social_post_attempts').insert({
          job_id: job.id,
          attempt_number: Number(job.attempt_count || 1),
          status: 'posted',
          provider_response: publishResult,
        })
        await supabase
          .from('social_post_jobs')
          .update({
            status: 'posted',
            last_error: null,
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', job.id)
      }

      await notifyHosts(
        supabase,
        event,
        'Recap carousel posted to Instagram',
        `Photos from "${event.title}" were posted to Instagram and removed from the app.`
      )
    } catch (error) {
      failed += 1
      const message = error instanceof Error ? error.message : 'Failed to post recap carousel'
      await supabase
        .from('event_recap_photos')
        .update({ status: 'pending', updated_at: nowIso })
        .in('id', photoIds)
      if (job?.id) {
        await supabase.from('social_post_attempts').insert({
          job_id: job.id,
          attempt_number: Number(job.attempt_count || nextAttempt),
          status: 'failed',
          error_message: message,
        })
        await supabase
          .from('social_post_jobs')
          .update({
            // Keep recap jobs off the poster worker queue. Photos go back to
            // pending so the recap worker can retry on the next hourly run.
            status: 'failed',
            last_error: message,
            attempt_count: Number(job.attempt_count || nextAttempt),
            processed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', job.id)
      }
    }
  }

  return { processed, posted, failed, skipped, waiting }
}
