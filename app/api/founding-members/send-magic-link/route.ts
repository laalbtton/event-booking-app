import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { isValidEmail, normalizeEmail } from '@/lib/foundingMembers'
import { sendEmail } from '@/lib/email'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://laalbutton.com'

/**
 * Generates a Supabase magic link for the Brampton Comedy Insider campaign
 * and sends a fully branded email via Resend instead of Supabase's generic template.
 * Called client-side after /api/founding-members/join succeeds.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const emailRaw = typeof body?.email === 'string' ? body.email : ''
    const firstName = typeof body?.firstName === 'string' ? body.firstName.trim() : 'there'
    const totalCredits = typeof body?.totalCredits === 'number' ? body.totalCredits : 5

    if (!isValidEmail(emailRaw)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const email = normalizeEmail(emailRaw)
    const callbackUrl = `${APP_URL}/auth/callback?intent=insider`

    // Generate the magic link URL server-side using admin privileges
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: callbackUrl },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('generateLink error:', linkError)
      return NextResponse.json(
        { error: linkError?.message || 'Could not generate magic link' },
        { status: 500 },
      )
    }

    const magicLinkUrl = linkData.properties.action_link

    const html = insiderMagicLinkEmail({ firstName, magicLinkUrl, totalCredits })

    const sent = await sendEmail({
      to: email,
      subject: `Your Brampton Comedy Insider access link 🎙`,
      html,
    })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('founding-members/send-magic-link error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    )
  }
}

function insiderMagicLinkEmail({
  firstName,
  magicLinkUrl,
  totalCredits,
}: {
  firstName: string
  magicLinkUrl: string
  totalCredits: number
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brampton Comedy Insider — Your Access Link</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:Arial,Helvetica,sans-serif;color:#e4e4e7;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#000000 0%,#18181b 60%,#1c1917 100%);border-radius:16px 16px 0 0;padding:36px 32px 28px;text-align:center;border:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#facc15;">
                🎙 Founding Members Club
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#ffffff;line-height:1.2;">
                Brampton Comedy Insider
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#18181b;padding:32px;border-left:1px solid rgba(255,255,255,0.08);border-right:1px solid rgba(255,255,255,0.08);">

              <p style="margin:0 0 16px;font-size:16px;color:#e4e4e7;">
                Hey ${firstName},
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                You're on your way to becoming one of the first <strong style="color:#e4e4e7;">500 Founding Members</strong> of Brampton Comedy Insider.
                Click the button below to activate your account and unlock your comedy credits.
              </p>

              <!-- Credits earned badge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(250,204,21,0.08);border:1px solid rgba(250,204,21,0.25);border-radius:12px;margin:0 0 28px;">
                <tr>
                  <td style="padding:18px 20px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#a1a1aa;">Credits Waiting For You</p>
                    <p style="margin:0;font-size:36px;font-weight:900;color:#facc15;">$${totalCredits}</p>
                    <p style="margin:4px 0 0;font-size:12px;color:#78716c;">Redeemable toward future Brampton comedy event tickets</p>
                  </td>
                </tr>
              </table>

              <!-- CTA button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${magicLinkUrl}"
                       style="display:inline-block;background-color:#facc15;color:#09090b;font-size:15px;font-weight:800;text-decoration:none;padding:14px 36px;border-radius:10px;letter-spacing:0.3px;">
                      Activate My Membership →
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#71717a;text-align:center;">
                This link expires in 24 hours and can only be used once.
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#52525b;text-align:center;word-break:break-all;">
                Or copy this link: <a href="${magicLinkUrl}" style="color:#facc15;text-decoration:none;">${magicLinkUrl}</a>
              </p>

              <!-- What happens next -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#09090b;border-radius:12px;margin:0 0 8px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <p style="margin:0 0 12px;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#71717a;">
                      What happens after you click
                    </p>
                    <p style="margin:0 0 8px;font-size:14px;color:#a1a1aa;">✓ &nbsp;Your Founding Member status is activated</p>
                    <p style="margin:0 0 8px;font-size:14px;color:#a1a1aa;">✓ &nbsp;Your comedy credits are unlocked in your account</p>
                    <p style="margin:0;font-size:14px;color:#a1a1aa;">✓ &nbsp;You'll get priority access to Brampton comedy shows</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#09090b;border-radius:0 0 16px 16px;padding:24px 32px;text-align:center;border:1px solid rgba(255,255,255,0.08);border-top:none;">
              <p style="margin:0 0 6px;font-size:13px;color:#52525b;">
                Follow us on Instagram for show updates
              </p>
              <a href="https://instagram.com/bramptonstandupcomedy" style="font-size:13px;font-weight:700;color:#facc15;text-decoration:none;">
                @bramptonstandupcomedy
              </a>
              <p style="margin:16px 0 0;font-size:11px;color:#3f3f46;">
                © 2026 Laal Button / One Mic Stand &nbsp;·&nbsp; Brampton, ON<br/>
                You received this because you signed up at laalbutton.com/brampton-comedy-insider
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
