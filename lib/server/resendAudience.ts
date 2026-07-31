/**
 * Resend Audience / Segment helpers.
 *
 * Uses the Resend SDK's new segments API (v6+). The segment ID is stored in
 * RESEND_SEGMENT_ID and represents the "One Mic Stand — All Users" segment.
 *
 * Required env vars:
 *   RESEND_API_KEY        – existing Resend key (also used for transactional email)
 *   RESEND_SEGMENT_ID     – segment ID from the Resend dashboard (Contacts → Segments)
 *   RESEND_FROM_EMAIL     – optional, defaults to noreply@laalbutton.com
 *
 * IMPORTANT: RESEND_SEGMENT_ID is a NEW requirement introduced when the weekly
 * digest moved from per-user transactional sends to a single Resend Broadcast.
 * If it is not set in Vercel, every broadcast send fails at the config check
 * below — this previously threw deep inside the call stack with no clear log,
 * making the weekly digest silently stop working. All helpers now fail loudly
 * with a specific, greppable error instead.
 */

import { Resend } from 'resend'

/** Returns a list of missing env var names required to send/manage the Resend audience. */
export function getMissingBroadcastConfig(): string[] {
  const missing: string[] = []
  if (!process.env.RESEND_API_KEY) missing.push('RESEND_API_KEY')
  if (!process.env.RESEND_SEGMENT_ID) missing.push('RESEND_SEGMENT_ID')
  return missing
}

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function getSegmentId(): string | null {
  const raw = process.env.RESEND_SEGMENT_ID
  if (!raw) return null
  // Defensively strip accidental wrapping quotes/whitespace — a common
  // copy-paste mistake when setting env vars in Vercel that produces an
  // ID Resend's API doesn't recognize (often surfacing as a generic 500).
  const cleaned = raw.trim().replace(/^['"]|['"]$/g, '').trim()
  if (!cleaned) return null

  // Resend segment/audience IDs are UUIDs (36 chars). Anything else almost
  // certainly means extra text got pasted into the env var by mistake —
  // fail loudly here instead of letting Resend's API return a generic 500.
  if (!UUID_RE.test(cleaned)) {
    console.error(
      `[resendAudience] RESEND_SEGMENT_ID does not look like a valid UUID ` +
        `(length=${cleaned.length}, expected 36). Re-copy the ID from the Resend ` +
        `dashboard (Contacts → Segments) and re-set the env var in Vercel.`,
    )
  }

  return cleaned
}

/** Masks a segment/audience id for safe logging (not a secret, but keep logs tidy). */
function maskId(id: string): string {
  if (id.length <= 10) return id
  return `${id.slice(0, 6)}…${id.slice(-4)} (len=${id.length})`
}

/** Result of an upsertContact call — callers (e.g. the backfill job) need this
 * to accurately count successes/failures instead of assuming every call
 * succeeded just because it didn't throw. */
export type UpsertContactResult = { success: true } | { success: false; error: string }

/**
 * Add or update a contact in the Resend segment.
 * Safe to call on every signup — Resend upserts by email.
 * Never throws — a Resend outage or missing config must never block signups.
 * Callers that need to know whether the contact actually landed in Resend
 * (e.g. the backfill admin route) should check the returned result rather
 * than assuming success from the absence of a thrown error.
 */
export async function upsertContact(
  email: string,
  firstName?: string | null,
): Promise<UpsertContactResult> {
  try {
    const missing = getMissingBroadcastConfig()
    if (missing.length > 0) {
      const error = `missing env var(s): ${missing.join(', ')}`
      console.error(`[resendAudience] upsertContact skipped — ${error}`)
      return { success: false, error }
    }
    const resend = getResend()!
    const segmentId = getSegmentId()!

    const { error } = await resend.contacts.create({
      email,
      firstName: firstName ?? undefined,
      unsubscribed: false,
      segments: [{ id: segmentId }],
    })

    if (error) {
      console.error('[resendAudience] upsertContact failed:', error)
      return { success: false, error: error.message || error.name || 'Unknown Resend error' }
    }
    return { success: true }
  } catch (err) {
    console.error('[resendAudience] upsertContact threw:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * Remove a contact from the segment (e.g. on account deletion).
 * Never throws, for the same reason as upsertContact.
 */
export async function removeContact(email: string): Promise<void> {
  try {
    const missing = getMissingBroadcastConfig()
    if (missing.length > 0) {
      console.error(`[resendAudience] removeContact skipped — missing env var(s): ${missing.join(', ')}`)
      return
    }
    const resend = getResend()!
    const segmentId = getSegmentId()!

    // The v6 SDK still accepts audienceId for the remove endpoint.
    const { error } = await resend.contacts.remove({
      audienceId: segmentId,
      email,
    })

    if (error) {
      console.error('[resendAudience] removeContact failed:', error)
    }
  } catch (err) {
    console.error('[resendAudience] removeContact threw:', err)
  }
}

/**
 * Create a broadcast (as a draft — does NOT send) and then send it in a
 * separate call. Split into two steps (rather than `create({ send: true })`)
 * so failures are attributable to a specific stage:
 *   - create failing   → problem with subject/html content or segment id
 *   - send failing     → problem sending to the segment (e.g. domain/quota)
 * Returns the broadcast ID on success, or null on any failure (config,
 * API error, or thrown exception) — always logs a specific, actionable reason.
 */
export async function sendBroadcast(opts: {
  subject: string
  html: string
  fromName?: string
}): Promise<string | null> {
  const missing = getMissingBroadcastConfig()
  if (missing.length > 0) {
    console.error(
      `[resendAudience] sendBroadcast aborted — missing env var(s): ${missing.join(', ')}. ` +
        'Set these in Vercel (Project → Settings → Environment Variables), then redeploy.',
    )
    return null
  }

  const resend = getResend()!
  const segmentId = getSegmentId()!
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@laalbutton.com'
  const fromName = opts.fromName || 'One Mic Stand'
  const from = `${fromName} <${fromEmail}>`

  console.info(`[resendAudience] sendBroadcast: using segmentId ${maskId(segmentId)}, from="${from}"`)

  let broadcastId: string | null = null

  try {
    const { data, error } = await resend.broadcasts.create({
      // Resend rejects the request if both segmentId and audienceId are set
      // ("Either `segment_id` or `audience_id` may be provided, but not
      // both."), so segmentId alone is correct for this account.
      segmentId,
      from,
      subject: opts.subject,
      html: opts.html,
    })

    if (error) {
      console.error('[resendAudience] sendBroadcast: CREATE step failed:', error)
      return null
    }

    if (!data?.id) {
      console.error('[resendAudience] sendBroadcast: CREATE step returned no broadcast id.')
      return null
    }

    broadcastId = data.id
    console.info(`[resendAudience] sendBroadcast: draft created (${broadcastId}), sending...`)
  } catch (err) {
    console.error('[resendAudience] sendBroadcast: CREATE step threw:', err)
    return null
  }

  try {
    const { error } = await resend.broadcasts.send(broadcastId)

    if (error) {
      console.error(`[resendAudience] sendBroadcast: SEND step failed for draft ${broadcastId}:`, error)
      return null
    }

    return broadcastId
  } catch (err) {
    console.error(`[resendAudience] sendBroadcast: SEND step threw for draft ${broadcastId}:`, err)
    return null
  }
}
