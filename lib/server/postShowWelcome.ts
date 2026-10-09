import type { SupabaseClient } from '@supabase/supabase-js'
import { emailAppStoreBadgesHtml } from '@/lib/appStores'
import { formatDigestEventDatePartsEastern } from '@/lib/dateUtils'
import { sendEmail } from '@/lib/email'
import { INSTAGRAM_HANDLE, INSTAGRAM_URL } from '@/lib/foundingMembers'
import { getBramptonWeekEvents } from '@/lib/server/bramptonEvents'
import { getSiteUrl } from '@/lib/server/emailUrl'
import type { PublicEventDetails } from '@/lib/server/publicContent'
import {
  addContactToSegment,
  getWelcomeSegmentId,
  listSegmentContactEmails,
  removeContactFromSegment,
  sendBroadcast,
} from '@/lib/server/resendAudience'

/** Resend merge tag — falls back to "there" when the contact has no first name. */
const FIRST_NAME_TAG = '{{{FIRST_NAME|there}}}'
const UNSUB_TAG = '{{{RESEND_UNSUBSCRIBE_URL}}}'

type WelcomeContext = {
  eventTitle: string | null
  eventDateLine: string | null
  venueName: string | null
  recapPhotoUrl: string | null
  upcoming: PublicEventDetails[]
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function upcomingCard(ev: PublicEventDetails, siteUrl: string): string {
  const url = `${siteUrl}/events/${ev.slug ?? ev.id}`
  const { dateLine, timeLine } = formatDigestEventDatePartsEastern(ev.startDate)
  const venue = ev.venue?.name || ev.locationText || 'Venue TBA'
  const img = ev.imageUrl
    ? `<a href="${url}" style="display:block;text-decoration:none;">
         <img src="${ev.imageUrl}" alt="${escapeHtml(ev.title)}" width="560"
              style="display:block;width:100%;max-height:240px;object-fit:cover;border-radius:10px 10px 0 0;background:#27272a;" />
       </a>`
    : ''
  return `
    <div style="margin:0 0 16px 0;border-radius:10px;border:1px solid #3f3f46;background:#18181b;overflow:hidden;">
      ${img}
      <div style="padding:16px 18px 18px;">
        <a href="${url}" style="display:block;font-size:16px;font-weight:700;color:#f5f5f4;text-decoration:none;line-height:1.35;margin-bottom:8px;">
          ${escapeHtml(ev.title)}
        </a>
        <p style="margin:0 0 4px 0;font-size:13px;color:#a8a29e;">📅 ${dateLine} &nbsp;·&nbsp; ${timeLine} ET</p>
        <p style="margin:0 0 14px 0;font-size:13px;color:#a8a29e;">📍 ${escapeHtml(venue)}</p>
        <a href="${url}" style="display:inline-block;background:#fbbf24;color:#09090b;font-size:13px;font-weight:700;padding:9px 20px;border-radius:7px;text-decoration:none;">
          Save my seat →
        </a>
      </div>
    </div>`
}

export function buildPostShowWelcomeHtml(ctx: WelcomeContext, opts: { personalized: boolean }): string {
  const siteUrl = getSiteUrl()
  const greetingName = opts.personalized ? FIRST_NAME_TAG : 'there'
  const title = ctx.eventTitle ? escapeHtml(ctx.eventTitle) : 'the show'
  const where = ctx.venueName ? ` at ${escapeHtml(ctx.venueName)}` : ''
  const when = ctx.eventDateLine ? ` on ${ctx.eventDateLine}` : ''

  const recapBlock = ctx.recapPhotoUrl
    ? `<tr><td style="padding:0 0 24px 0;">
         <img src="${ctx.recapPhotoUrl}" alt="${title}" width="600"
              style="display:block;width:100%;max-height:360px;object-fit:cover;border-radius:12px;background:#27272a;" />
       </td></tr>`
    : ''

  const upcomingBlock =
    ctx.upcoming.length > 0
      ? `<tr><td style="padding:0 0 8px 0;">
           <h2 style="font-size:14px;font-weight:700;color:#fbbf24;margin:0 0 14px 0;text-transform:uppercase;letter-spacing:0.08em;border-bottom:1px solid #3f3f46;padding-bottom:8px;">
             Coming up in Brampton
           </h2>
           ${ctx.upcoming.slice(0, 4).map((ev) => upcomingCard(ev, siteUrl)).join('')}
         </td></tr>`
      : ''

  const unsubscribe = opts.personalized
    ? `<a href="${UNSUB_TAG}" style="color:#78716c;text-decoration:underline;">Unsubscribe</a>`
    : `Reply to this email with "unsubscribe" and we'll remove you right away.`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanks for coming out</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              <p style="margin:0 0 12px 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#78716c;font-weight:600;">One Mic Stand · Brampton</p>
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#f5f5f4;line-height:1.2;">
                Thanks for coming out 🙌
              </h1>
            </td>
          </tr>

          ${recapBlock}

          <tr>
            <td style="padding:0 0 24px 0;">
              <p style="margin:0 0 12px 0;font-size:16px;color:#f5f5f4;">Hi ${greetingName},</p>
              <p style="margin:0 0 12px 0;font-size:15px;color:#a8a29e;line-height:1.7;">
                It was great having you${where}${when} for <strong style="color:#f5f5f4;">${title}</strong>.
                You signed up at the show to hear about what&rsquo;s next &mdash; so here it is.
              </p>
              <p style="margin:0;font-size:15px;color:#a8a29e;line-height:1.7;">
                We run comedy and open mics in Brampton every week. Grab a seat early &mdash; the small rooms fill up.
              </p>
            </td>
          </tr>

          ${upcomingBlock}

          <tr>
            <td style="padding:8px 0 28px 0;">
              <div style="border-radius:12px;border:1px solid #fbbf2466;background:#1c1917;padding:20px 22px;">
                <p style="margin:0 0 6px 0;font-size:15px;font-weight:700;color:#f5f5f4;">Become a Brampton Comedy Insider</p>
                <p style="margin:0 0 14px 0;font-size:14px;color:#a8a29e;line-height:1.6;">
                  Get $25 in show credits for creating a free account and telling us what kind of comedy you like.
                  Insiders hear about new shows first.
                </p>
                <a href="${siteUrl}/brampton-comedy-insider"
                   style="display:inline-block;background:#fbbf24;color:#09090b;font-size:14px;font-weight:700;padding:11px 24px;border-radius:8px;text-decoration:none;">
                  Claim my $25 →
                </a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:0 0 28px 0;text-align:center;">
              <a href="${siteUrl}/brampton" style="color:#fbbf24;font-size:14px;font-weight:600;text-decoration:none;">See every Brampton show →</a>
              <span style="color:#52525b;padding:0 10px;">·</span>
              <a href="${INSTAGRAM_URL}" style="color:#fbbf24;font-size:14px;font-weight:600;text-decoration:none;">@${INSTAGRAM_HANDLE}</a>
            </td>
          </tr>

          <tr><td style="border-top:1px solid #3f3f46;padding:0 0 20px 0;"></td></tr>

          <tr>
            <td style="padding:0 0 24px 0;text-align:center;">
              ${emailAppStoreBadgesHtml()}
              <p style="margin:6px 0 0 0;font-size:12px;color:#52525b;line-height:1.6;">
                You&rsquo;re receiving this because you signed up for show updates at a One Mic Stand event in Brampton, ON.<br>
                ${unsubscribe}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

export async function buildWelcomeContext(
  supabase: SupabaseClient,
  eventId: string | null,
): Promise<WelcomeContext> {
  let eventTitle: string | null = null
  let eventDateLine: string | null = null
  let venueName: string | null = null
  let recapPhotoUrl: string | null = null

  if (eventId) {
    const { data: ev } = await supabase
      .from('events')
      .select('id, title, date, location, venues(name)')
      .eq('id', eventId)
      .maybeSingle()
    if (ev) {
      const row = ev as { title: string; date: string; location: string | null; venues: { name: string } | { name: string }[] | null }
      eventTitle = row.title
      eventDateLine = formatDigestEventDatePartsEastern(row.date).dateLine
      const v = Array.isArray(row.venues) ? row.venues[0] : row.venues
      venueName = v?.name || row.location || null
    }
    const { data: photo } = await supabase
      .from('event_recap_photos')
      .select('public_url')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()
    recapPhotoUrl = (photo as { public_url?: string | null } | null)?.public_url || null
  }

  let upcoming: PublicEventDetails[] = []
  try {
    const bundle = await getBramptonWeekEvents()
    upcoming = bundle.upcomingAll.filter((e) => e.id !== eventId).slice(0, 4)
  } catch (err) {
    console.error('[postShowWelcome] could not load upcoming events:', err)
  }

  return { eventTitle, eventDateLine, venueName, recapPhotoUrl, upcoming }
}

export type WelcomeSendResult = {
  mode: 'broadcast' | 'transactional'
  recipientCount: number
  broadcastId: string | null
  failures: string[]
  skippedNotInSegment: string[]
}

type Recipient = { id: string; email: string; first_name: string | null }

/**
 * Send the post-show welcome to everyone in a batch.
 *
 * Preferred path: Resend Broadcast to the welcome-queue segment (marketing
 * quota, personalised with merge tags). Falls back to one transactional email
 * per person when RESEND_WELCOME_SEGMENT_ID is not configured.
 */
export async function sendPostShowWelcome(
  supabase: SupabaseClient,
  batchId: string,
): Promise<WelcomeSendResult> {
  const { data: batch, error: batchError } = await supabase
    .from('audience_signup_imports')
    .select('id, event_id, welcome_sent_at')
    .eq('id', batchId)
    .maybeSingle()
  if (batchError || !batch) throw new Error(batchError?.message || 'Batch not found')
  if (batch.welcome_sent_at) throw new Error('Welcome email was already sent for this batch')

  const { data: members } = await supabase
    .from('founding_members')
    .select('id, email, first_name')
    .eq('import_batch_id', batchId)
    .eq('email_updates_opt_in', true)
  const recipients = (members || []) as Recipient[]
  if (recipients.length === 0) throw new Error('No opted-in recipients in this batch')

  const ctx = await buildWelcomeContext(supabase, batch.event_id as string | null)
  const subject = ctx.eventTitle ? `Thanks for coming to ${ctx.eventTitle} 🙌` : 'Thanks for coming out 🙌'
  const welcomeSegmentId = getWelcomeSegmentId()
  const nowIso = new Date().toISOString()

  let result: WelcomeSendResult

  if (welcomeSegmentId) {
    // Make sure the segment contains exactly this batch before broadcasting:
    // drop anyone else (e.g. a later import), re-add anyone from this batch
    // who was drained by an earlier send.
    const inSegment = new Set(await listSegmentContactEmails(welcomeSegmentId))
    const batchEmails = new Set(recipients.map((r) => r.email.toLowerCase()))
    const strays = [...inSegment].filter((e) => !batchEmails.has(e))
    for (const stray of strays) await removeContactFromSegment(stray, welcomeSegmentId)
    const skippedNotInSegment: string[] = []
    for (const r of recipients) {
      const email = r.email.toLowerCase()
      if (inSegment.has(email)) continue
      const added = await addContactToSegment(email, welcomeSegmentId)
      if (!added.success) skippedNotInSegment.push(email)
    }

    const html = buildPostShowWelcomeHtml(ctx, { personalized: true })
    const broadcastId = await sendBroadcast({
      subject,
      html,
      segmentId: welcomeSegmentId,
      name: `Post-show welcome · ${ctx.eventTitle || batchId.slice(0, 8)}`,
    })
    if (!broadcastId) throw new Error('Resend broadcast failed — check server logs for the specific reason')

    // Drain the queue so the next batch starts clean.
    for (const r of recipients) await removeContactFromSegment(r.email, welcomeSegmentId)

    result = {
      mode: 'broadcast',
      recipientCount: recipients.length - skippedNotInSegment.length,
      broadcastId,
      failures: [],
      skippedNotInSegment,
    }
  } else {
    const html = buildPostShowWelcomeHtml(ctx, { personalized: false })
    const failures: string[] = []
    for (const r of recipients) {
      const personal = r.first_name ? html.replace('Hi there,', `Hi ${escapeHtml(r.first_name)},`) : html
      const ok = await sendEmail({ to: r.email, subject, html: personal })
      if (!ok) failures.push(r.email)
    }
    result = {
      mode: 'transactional',
      recipientCount: recipients.length - failures.length,
      broadcastId: null,
      failures,
      skippedNotInSegment: [],
    }
  }

  const sentIds = recipients
    .filter((r) => !result.failures.includes(r.email) && !result.skippedNotInSegment.includes(r.email.toLowerCase()))
    .map((r) => r.id)
  if (sentIds.length > 0) {
    await supabase.from('founding_members').update({ welcome_sent_at: nowIso }).in('id', sentIds)
  }
  await supabase
    .from('audience_signup_imports')
    .update({
      welcome_sent_at: nowIso,
      welcome_broadcast_id: result.broadcastId,
      welcome_recipient_count: result.recipientCount,
      welcome_send_mode: result.mode,
    })
    .eq('id', batchId)

  return result
}
