import type { PublicEventDetails } from '@/lib/server/publicContent'

type SchemaWithContext = Record<string, unknown> & { '@context': 'https://schema.org' }

function buildEventUrl(baseUrl: string, slugOrId: string) {
  return `${baseUrl.replace(/\/$/, '')}/events/${slugOrId}`
}

export function buildEventJsonLd(event: PublicEventDetails, siteUrl: string): SchemaWithContext {
  const identifier = event.slug || event.id
  const url = buildEventUrl(siteUrl, identifier)

  const locationAddress = event.venue
    ? {
        '@type': 'PostalAddress',
        streetAddress: event.venue.address || undefined,
        addressLocality: event.venue.city || undefined,
        addressRegion: event.venue.region || undefined,
        postalCode: event.venue.postalCode || undefined,
        addressCountry: event.venue.country || undefined,
      }
    : undefined

  const offerUrl = event.ticketUrl || url
  const price = event.isFree ? 0 : Number((event.ticketPriceCents || 0) / 100).toFixed(2)

  const performers = event.performerLineup.map((performer) => ({
    '@type': 'Person',
    name: performer.name,
  }))

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    description: event.description || '',
    startDate: event.startDate,
    endDate: event.endDate || undefined,
    eventStatus: event.isCancelled
      ? 'https://schema.org/EventCancelled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: event.venue?.name || event.locationText || 'Venue TBA',
      address: locationAddress,
    },
    organizer: {
      '@type': 'Organization',
      name: event.organizerName || 'One Mic Stand',
    },
    offers: {
      '@type': 'Offer',
      url: offerUrl,
      price,
      priceCurrency: 'USD',
      availability:
        event.ticketAvailability === 'SoldOut'
          ? 'https://schema.org/SoldOut'
          : 'https://schema.org/InStock',
    },
    performer: performers.length > 0 ? performers : undefined,
  }
}
