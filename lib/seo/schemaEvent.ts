import type { PublicEventDetails } from '@/lib/server/publicContent'

type SchemaWithContext = Record<string, unknown> & { '@context': 'https://schema.org' }

// Fallback image used when an event has no poster. Must be an absolute URL.
// icon-512.png is the PWA icon referenced in manifest.json and is always deployed.
const DEFAULT_IMAGE = 'https://app.laalbutton.com/icon-512.png'

function buildEventUrl(baseUrl: string, slugOrId: string) {
  return `${baseUrl.replace(/\/$/, '')}/events/${slugOrId}`
}

/**
 * Parse a free-text location string like "1234 Main St, Toronto, ON M5V 2T1, Canada"
 * into PostalAddress components as a best-effort fallback when structured venue data
 * is not available.
 */
function parseLocationText(locationText: string): {
  streetAddress: string | undefined
  addressLocality: string | undefined
  addressRegion: string | undefined
  postalCode: string | undefined
  addressCountry: string | undefined
} {
  const parts = locationText.split(',').map((p) => p.trim()).filter(Boolean)

  // Canadian postal code pattern (e.g. M5V 2T1)
  const postalCodeRe = /\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/i
  // US zip code pattern
  const zipRe = /\b\d{5}(-\d{4})?\b/

  let streetAddress: string | undefined
  let addressLocality: string | undefined
  let addressRegion: string | undefined
  let postalCode: string | undefined
  let addressCountry: string | undefined

  if (parts.length === 1) {
    // Could be just "Toronto" or "Toronto, ON"
    addressLocality = parts[0]
    return { streetAddress, addressLocality, addressRegion, postalCode, addressCountry }
  }

  // Last part is often the country
  const lastPart = parts[parts.length - 1]
  if (/^(canada|united states|usa|us|uk|united kingdom)$/i.test(lastPart)) {
    const countryMap: Record<string, string> = {
      canada: 'CA',
      'united states': 'US',
      usa: 'US',
      us: 'US',
      uk: 'GB',
      'united kingdom': 'GB',
    }
    addressCountry = countryMap[lastPart.toLowerCase()] || lastPart
    parts.pop()
  }

  // Look for a part containing a postal/zip code — merge it into the region segment
  for (let i = 0; i < parts.length; i++) {
    const caMatch = parts[i].match(postalCodeRe)
    const usMatch = parts[i].match(zipRe)
    if (caMatch) {
      postalCode = caMatch[0].toUpperCase()
      // Remove the postal code token from that part to isolate the region code
      const remainder = parts[i].replace(postalCodeRe, '').trim()
      if (remainder) addressRegion = remainder
      parts.splice(i, 1)
      break
    } else if (usMatch) {
      postalCode = usMatch[0]
      const remainder = parts[i].replace(zipRe, '').trim()
      if (remainder) addressRegion = remainder
      parts.splice(i, 1)
      break
    }
  }

  if (parts.length >= 3) {
    streetAddress = parts[0]
    addressLocality = parts[1]
    if (!addressRegion) addressRegion = parts[2]
  } else if (parts.length === 2) {
    streetAddress = parts[0]
    addressLocality = parts[1]
  } else if (parts.length === 1) {
    addressLocality = parts[0]
  }

  return { streetAddress, addressLocality, addressRegion, postalCode, addressCountry }
}

export function buildEventJsonLd(event: PublicEventDetails, siteUrl: string): SchemaWithContext {
  const identifier = event.slug || event.id
  const url = buildEventUrl(siteUrl, identifier)

  // ── Address ─────────────────────────────────────────────────────────────────
  let locationAddress: Record<string, unknown> | undefined

  if (event.venue) {
    // Structured venue data — preferred path
    locationAddress = {
      '@type': 'PostalAddress',
      streetAddress: event.venue.address || undefined,
      addressLocality: event.venue.city || undefined,
      addressRegion: event.venue.region || undefined,
      postalCode: event.venue.postalCode || undefined,
      addressCountry: event.venue.country || undefined,
    }
    // Remove keys with undefined values so the output stays clean
    Object.keys(locationAddress).forEach(
      (k) => locationAddress![k] === undefined && delete locationAddress![k]
    )
  } else if (event.locationText) {
    // Free-text fallback — parse best-effort
    const parsed = parseLocationText(event.locationText)
    locationAddress = { '@type': 'PostalAddress' }
    if (parsed.streetAddress) locationAddress.streetAddress = parsed.streetAddress
    if (parsed.addressLocality) locationAddress.addressLocality = parsed.addressLocality
    if (parsed.addressRegion) locationAddress.addressRegion = parsed.addressRegion
    if (parsed.postalCode) locationAddress.postalCode = parsed.postalCode
    if (parsed.addressCountry) locationAddress.addressCountry = parsed.addressCountry
  }

  // ── Image ───────────────────────────────────────────────────────────────────
  // Use the event's poster image if available, otherwise fall back to a platform default.
  // Must be an absolute HTTPS URL.
  const imageUrl = event.imageUrl
    ? event.imageUrl.startsWith('http')
      ? event.imageUrl
      : `${siteUrl.replace(/\/$/, '')}${event.imageUrl}`
    : DEFAULT_IMAGE

  // ── Offers ──────────────────────────────────────────────────────────────────
  const offerUrl = event.ticketUrl || url
  const price = event.isFree ? 0 : Number((event.ticketPriceCents || 0) / 100).toFixed(2)

  // ── Performers ──────────────────────────────────────────────────────────────
  const performers = event.performerLineup.map((performer) => ({
    '@type': 'Person',
    name: performer.name,
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || '',
    image: imageUrl,
    startDate: event.startDate,
    endDate: event.endDate || undefined,
    eventStatus: event.isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venue?.name || event.locationText || 'Venue TBA',
      ...(locationAddress ? { address: locationAddress } : {}),
    },
    organizer: {
      '@type': 'Organization',
      name: event.organizerName || 'One Mic Stand',
    },
    offers: {
      '@type': 'Offer',
      url: offerUrl,
      price,
      priceCurrency: 'CAD',
      availability:
        event.ticketAvailability === 'SoldOut'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
    },
    performer: performers.length > 0 ? performers : undefined,
  }
}
