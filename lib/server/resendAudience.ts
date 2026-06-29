/**
 * Resend Audience / Segment helpers.
 *
 * Uses the Resend SDK's new segments API (v6+). The segment ID is stored in
 * RESEND_SEGMENT_ID and represents the "One Mic Stand — All Users" segment.
 *
 * Required env vars:
 *   RESEND_API_KEY        – existing Resend key
 *   RESEND_SEGMENT_ID     – segment ID from the Resend dashboard
 */

import { Resend } from 'resend'

function getResend() {
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY is not set')
  return new Resend(key)
}

function getSegmentId() {
  const id = process.env.RESEND_SEGMENT_ID
  if (!id) throw new Error('RESEND_SEGMENT_ID is not set')
  return id
}

/**
 * Add or update a contact in the Resend segment.
 * Safe to call on every signup — Resend upserts by email.
 */
export async function upsertContact(
  email: string,
  firstName?: string | null,
): Promise<void> {
  const resend = getResend()
  const segmentId = getSegmentId()

  const { error } = await resend.contacts.create({
    email,
    firstName: firstName ?? undefined,
    unsubscribed: false,
    segments: [{ id: segmentId }],
  })

  if (error) {
    // Non-fatal — log but don't throw so a Resend outage never blocks signups.
    console.error('[resendAudience] upsertContact failed:', error)
  }
}

/**
 * Remove a contact from the segment (e.g. on account deletion).
 */
export async function removeContact(email: string): Promise<void> {
  const resend = getResend()
  const segmentId = getSegmentId()

  // The v6 SDK still accepts audienceId for the remove endpoint.
  const { error } = await resend.contacts.remove({
    audienceId: segmentId,
    email,
  })

  if (error) {
    console.error('[resendAudience] removeContact failed:', error)
  }
}

/**
 * Create and immediately send a broadcast to the entire segment.
 * Returns the broadcast ID on success.
 */
export async function sendBroadcast(opts: {
  subject: string
  html: string
  fromName?: string
}): Promise<string | null> {
  const resend = getResend()
  const segmentId = getSegmentId()
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@laalbutton.com'
  const fromName = opts.fromName || 'One Mic Stand'
  const from = `${fromName} <${fromEmail}>`

  const { data, error } = await resend.broadcasts.create({
    segmentId,
    from,
    subject: opts.subject,
    html: opts.html,
    send: true,
  })

  if (error) {
    console.error('[resendAudience] sendBroadcast failed:', error)
    return null
  }

  return data?.id ?? null
}
