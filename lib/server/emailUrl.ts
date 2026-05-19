/**
 * Centralized URL helpers for outgoing emails.
 *
 * Resolution order for the base URL (first non-empty value wins):
 *   1. NEXT_PUBLIC_SITE_URL   ← set this in Vercel to the canonical app URL
 *   2. NEXT_PUBLIC_APP_URL
 *   3. https://app.laalbutton.com  (hardcoded fallback)
 *
 * All helpers strip trailing slashes so link paths are never doubled.
 *
 * To fix broken email links:
 *   → Set  NEXT_PUBLIC_SITE_URL=https://app.laalbutton.com  in Vercel.
 */

/**
 * Returns the canonical base URL used in all outgoing emails, e.g.
 * "https://app.laalbutton.com" (no trailing slash).
 */
export function getSiteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'https://app.laalbutton.com'
  return raw.replace(/\/$/, '')
}

/**
 * Builds the canonical URL for a specific event page.
 *
 * @param slugOrId  The event slug (preferred) or UUID. Pass `ev.slug ?? ev.id`.
 * @returns Full URL string, e.g. "https://app.laalbutton.com/events/my-event-slug"
 *          Returns null when slugOrId is null/undefined/empty so callers can
 *          skip events that have no valid link.
 */
export function buildEventUrl(slugOrId: string | null | undefined): string | null {
  const path = slugOrId?.trim()
  if (!path) return null
  return `${getSiteUrl()}/events/${path}`
}

/**
 * Validates that the configured base URL is actually reachable by making a
 * single HEAD request with a 6-second timeout.
 *
 * Returns { ok: true } when the base URL responds with any HTTP status
 * (even a redirect or 404 means DNS/TLS resolved correctly).
 * Returns { ok: false, reason } when the URL is unreachable (network error,
 * DNS failure, timeout, etc.).
 *
 * Use this once at the start of the weekly digest job to catch misconfigured
 * NEXT_PUBLIC_SITE_URL before sending hundreds of emails with broken links.
 */
export async function validateBaseUrl(): Promise<{ ok: boolean; reason?: string }> {
  const base = getSiteUrl()
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 6_000)
    const res = await fetch(base, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(tid)
    // Any HTTP response (including 4xx) means the server is reachable.
    // We flag only genuine network failures, not content errors.
    return res.status < 500
      ? { ok: true }
      : { ok: false, reason: `Base URL returned HTTP ${res.status}` }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `Network error fetching base URL "${base}": ${msg}` }
  }
}

/**
 * Validates a specific event URL by making a HEAD request.
 * Returns true when the URL resolves with HTTP < 500.
 * Use sparingly – prefer validating the base URL once over checking every link.
 */
export async function validateEventUrl(url: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const tid = setTimeout(() => controller.abort(), 6_000)
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
    })
    clearTimeout(tid)
    return res.status < 500
  } catch {
    return false
  }
}
