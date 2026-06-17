// Brampton Comedy Insider — shared campaign constants, types, and helpers.

export const FOUNDING_MEMBER_LIMIT = 500

// User-facing campaign credit values
export const CREDIT_ACCOUNT = 5
export const CREDIT_PREFERENCES = 15
export const CREDIT_EMAIL_UPDATES = 5

// Backend-only future rewards (NOT shown on the landing page)
export const CREDIT_WHATSAPP = 5
export const CREDIT_APP = 5

export const CREDIT_TOTAL_AVAILABLE = CREDIT_ACCOUNT + CREDIT_PREFERENCES + CREDIT_EMAIL_UPDATES // $25

export const INSTAGRAM_HANDLE = 'bramptonstandupcomedy'
export const INSTAGRAM_URL = 'https://instagram.com/bramptonstandupcomedy'

export type FoundingMemberCreditFlags = {
  account_credit_awarded?: boolean | null
  preferences_credit_awarded?: boolean | null
  email_updates_credit_awarded?: boolean | null
  whatsapp_credit_awarded?: boolean | null
  app_credit_awarded?: boolean | null
}

/** Recompute total credits from the award flags so the total is always consistent. */
export function computeTotalCredits(flags: FoundingMemberCreditFlags): number {
  let total = 0
  if (flags.account_credit_awarded) total += CREDIT_ACCOUNT
  if (flags.preferences_credit_awarded) total += CREDIT_PREFERENCES
  if (flags.email_updates_credit_awarded) total += CREDIT_EMAIL_UPDATES
  if (flags.whatsapp_credit_awarded) total += CREDIT_WHATSAPP
  if (flags.app_credit_awarded) total += CREDIT_APP
  return total
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim())
}

// ── Form option sets ─────────────────────────────────────────
export const AGE_RANGES = ['Under 18', '18-24', '25-34', '35-44', '45-54', '55+'] as const

export const CANADA_STATUSES = [
  'Born in Canada',
  'Moved to Canada within the last 5 years',
  'Moved to Canada 5-10 years ago',
  'Moved to Canada more than 10 years ago',
  'Prefer not to say',
] as const

export const CITIES = ['Brampton', 'Mississauga', 'Vaughan', 'Toronto', 'Caledon', 'Other'] as const

export const DOWNTOWN_INTEREST = ['Definitely', 'Maybe', 'Probably Not'] as const

export const COMEDY_PREFERENCES = [
  'English Comedy',
  'Punjabi Comedy',
  'Hindi Comedy',
  'Mixed English/Punjabi',
  'Clean Comedy',
  'Dark Comedy',
  'Roast Comedy',
  'Family Friendly',
  'Crowd Work',
  'Open Mic Nights',
] as const

export const TICKET_PRICE_RANGES = ['Free Only', '$10-$15', '$15-$25', '$25-$35', '$35+'] as const

// ── Analytics ────────────────────────────────────────────────
export type InsiderAnalyticsEvent =
  | 'landing_page_view'
  | 'cta_clicked'
  | 'email_submitted'
  | 'magic_link_sent'
  | 'signup_completed'
  | 'preferences_started'
  | 'preferences_completed'
  | 'email_opt_in'
  | 'credit_awarded'
  | 'instagram_clicked'

/** Fire a campaign analytics event into Google Analytics (gtag) if available. */
export function trackInsiderEvent(
  event: InsiderAnalyticsEvent,
  params?: Record<string, unknown>,
): void {
  if (typeof window === 'undefined') return
  const w = window as unknown as { gtag?: (...args: unknown[]) => void; dataLayer?: unknown[] }
  try {
    if (typeof w.gtag === 'function') {
      w.gtag('event', event, { campaign: 'brampton_comedy_insider', ...params })
    } else if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push({ event, campaign: 'brampton_comedy_insider', ...params })
    }
  } catch {
    // analytics is best-effort
  }
}
