import type { Metadata } from 'next'
import Link from 'next/link'
import { PublicHeader } from '@/components/public/PublicHeader'

export const metadata: Metadata = {
  title: 'Privacy Policy — One Mic Stand',
  description: 'How One Mic Stand (Laal Button) collects, uses, and protects your personal information.',
}

const EFFECTIVE_DATE = 'May 28, 2026'
const CONTACT_EMAIL = 'events@laalbutton.com'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  return (
    <>
      <PublicHeader />
      <div className="min-h-screen bg-background pb-20 px-4 py-8">
        <article className="max-w-2xl mx-auto space-y-8">
          <header className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              <strong>One Mic Stand</strong> (operated by Laal Button) · Effective {EFFECTIVE_DATE}
            </p>
          </header>

          <Section title="Who we are">
            <p>
              One Mic Stand helps performers and audiences discover, book, and manage comedy and
              open-mic events in Canada. This policy describes how we handle personal information
              when you use our website and mobile app at{' '}
              <a href="https://app.laalbutton.com" className="text-primary underline underline-offset-2">
                app.laalbutton.com
              </a>
              .
            </p>
          </Section>

          <Section title="Information we collect">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Account data:</strong> email address, name, password (stored securely by our
                auth provider), and profile details you choose to add (bio, avatar, social links).
              </li>
              <li>
                <strong>Authentication:</strong> if you sign in with Google, we receive basic
                profile information from Google (such as name and email) according to your Google
                account settings.
              </li>
              <li>
                <strong>Bookings &amp; activity:</strong> events you book, attendance status, credits
                used, waitlist position, and related in-app actions.
              </li>
              <li>
                <strong>Payments:</strong> when you purchase credits, payment processing is handled
                by Stripe. We do not store full card numbers on our servers.
              </li>
              <li>
                <strong>Push notifications:</strong> device push tokens if you enable
                notifications.
              </li>
              <li>
                <strong>Usage analytics:</strong> aggregated usage data via Google Analytics to
                improve the product.
              </li>
              <li>
                <strong>Communications:</strong> emails we send about bookings, reminders, and
                account-related messages.
              </li>
            </ul>
          </Section>

          <Section title="How we use your information">
            <ul className="list-disc pl-5 space-y-1">
              <li>Create and manage your account</li>
              <li>Process event bookings, credits, and refunds</li>
              <li>Send transactional emails and optional push notifications you control in Settings</li>
              <li>Operate communities, venues, and event listings</li>
              <li>Improve security, prevent abuse, and analyze app usage</li>
              <li>Comply with legal obligations</li>
            </ul>
          </Section>

          <Section title="How we share information">
            <p>We do not sell your personal information. We share data only with service providers that help us run the app, including:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase</strong> — authentication, database, and hosting of app data</li>
              <li><strong>Stripe</strong> — payment processing</li>
              <li><strong>Google</strong> — Sign-in with Google and analytics</li>
              <li><strong>Firebase / web push</strong> — push notification delivery</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
            </ul>
            <p>These providers process data under their own privacy policies and our instructions.</p>
          </Section>

          <Section title="Data retention">
            <p>
              We keep your information while your account is active and as needed to provide the
              service. If you delete your account, we remove associated profile and app data as
              described on our{' '}
              <Link href="/delete-account" className="text-primary underline underline-offset-2">
                account deletion
              </Link>{' '}
              page. Some records (for example payment or tax-related data) may be retained longer
              where required by law.
            </p>
          </Section>

          <Section title="Security">
            <p>
              Data is transmitted over encrypted connections (HTTPS/TLS). Access to production
              systems is restricted. No method of transmission or storage is 100% secure; contact us
              if you believe your account has been compromised.
            </p>
          </Section>

          <Section title="Your choices and rights">
            <ul className="list-disc pl-5 space-y-1">
              <li>Update profile information in the app</li>
              <li>Manage notification preferences in Settings</li>
              <li>
                Delete your account at{' '}
                <Link href="/delete-account" className="text-primary underline underline-offset-2">
                  /delete-account
                </Link>{' '}
                or via Settings → Account
              </li>
              <li>
                Contact us at{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                  {CONTACT_EMAIL}
                </a>{' '}
                to request access, correction, or deletion of your data
              </li>
            </ul>
          </Section>

          <Section title="Children">
            <p>
              One Mic Stand is not directed at children under 13, and we do not knowingly collect
              personal information from children under 13. Contact us if you believe we have
              collected such information.
            </p>
          </Section>

          <Section title="Changes to this policy">
            <p>
              We may update this policy from time to time. We will post the revised version on this
              page with an updated effective date. Continued use of the app after changes means you
              accept the updated policy.
            </p>
          </Section>

          <Section title="Contact us">
            <p>
              Questions about this privacy policy:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
              . See also our{' '}
              <Link href="/contact" className="text-primary underline underline-offset-2">
                contact page
              </Link>
              .
            </p>
          </Section>
        </article>
      </div>
    </>
  )
}
