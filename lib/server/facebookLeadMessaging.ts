import { emailAppStoreBadgesHtml } from '@/lib/appStores'
import {
  getEmailTemplate,
  interpolate,
  TEMPLATE_KEYS,
} from '@/lib/server/emailTemplates'
import { getSiteUrl } from '@/lib/server/emailUrl'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatEmailParagraph(value: string): string {
  return escapeHtml(value)
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" style="color:#fbbf24;text-decoration:underline;word-break:break-all">$1</a>',
    )
    .replace(/\n/g, '<br>')
}

const WHATSAPP_GROUP_URL =
  'https://chat.whatsapp.com/JGvL1FAqa8n9tl6tsuceTO?s=cl&p=a&iam=2'

export async function buildFacebookLeadWelcomeEmail(name: string): Promise<{
  subject: string
  html: string
}> {
  const firstName = escapeHtml(name.trim().split(/\s+/)[0] || 'there')
  const siteUrl = getSiteUrl()
  const bramptonUrl = `${siteUrl}/brampton`
  const template = await getEmailTemplate(TEMPLATE_KEYS.FACEBOOK_LEAD_WELCOME)
  const subject = interpolate(template.subject, { user_name: firstName })
  const intro = formatEmailParagraph(
    interpolate(template.intro, { user_name: firstName }),
  )
  const footer = formatEmailParagraph(
    interpolate(template.footer, { user_name: firstName }),
  )

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#09090b;font-family:Arial,sans-serif;color:#f5f5f4">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
        <tr><td>
          <h1 style="font-size:28px;margin:0 0 20px;color:#fbbf24">Welcome to Laal Button 🎤</h1>
          <p style="font-size:16px;line-height:1.7">Hi ${firstName},</p>
          <p style="font-size:16px;line-height:1.7;color:#d6d3d1">${intro}</p>
          <p style="margin:28px 0 12px">
            <a href="${bramptonUrl}" style="display:inline-block;background:#fbbf24;color:#09090b;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">
              Brampton show details
            </a>
          </p>
          <p style="margin:0 0 28px">
            <a href="${WHATSAPP_GROUP_URL}" style="display:inline-block;background:#25D366;color:#09090b;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">
              Join the WhatsApp group
            </a>
          </p>
          ${emailAppStoreBadgesHtml()}
          <p style="font-size:12px;color:#78716c;line-height:1.6">${footer}</p>
        </td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`

  return { subject, html }
}

export async function sendLeadWelcomeEmail(input: {
  email: string
  name: string
  idempotencyKey: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY is not configured' }

  try {
    const { subject, html } = await buildFacebookLeadWelcomeEmail(input.name)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': input.idempotencyKey,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@laalbutton.com',
        to: [input.email],
        subject,
        html,
      }),
    })
    if (response.ok) return { ok: true }
    return { ok: false, error: `Resend returned ${response.status}: ${await response.text()}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown email error' }
  }
}

export async function sendLeadWelcomeSms(input: {
  phone: string
  name: string
  idempotencyKey: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID
  if (!accountSid || !authToken || (!from && !messagingServiceSid)) {
    return { ok: false, error: 'Twilio environment variables are not configured' }
  }

  const firstName = input.name.trim().split(/\s+/)[0] || 'there'
  const form = new URLSearchParams({
    To: input.phone,
    Body: `Hi ${firstName}! Welcome to One Mic Stand 🎤 We’ll keep you posted about upcoming comedy shows. ${getSiteUrl()}/brampton Reply STOP to opt out.`,
  })
  if (messagingServiceSid) form.set('MessagingServiceSid', messagingServiceSid)
  else form.set('From', from!)

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Idempotency-Key': input.idempotencyKey,
        },
        body: form,
      },
    )
    if (response.ok) return { ok: true }
    return { ok: false, error: `Twilio returned ${response.status}: ${await response.text()}` }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown SMS error' }
  }
}
