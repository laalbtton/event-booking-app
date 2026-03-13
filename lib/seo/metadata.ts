import type { Metadata } from 'next'
import type { PublicEventDetails, PublicPerformerProfile } from '@/lib/server/publicContent'

const APP_NAME = 'One Mic Stand'

export function getSiteUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://app.laalbutton.com'
}

function trimTo(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, max - 1).trimEnd()}...`
}

function formatDateForTitle(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function inferCity(event: PublicEventDetails): string {
  if (event.venue?.city) return event.venue.city
  const parts = (event.locationText || '').split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return 'Live'
}

export function buildEventMetadata(event: PublicEventDetails): Metadata {
  const siteUrl = getSiteUrl()
  const pathPart = event.slug || event.id
  const url = `${siteUrl.replace(/\/$/, '')}/events/${pathPart}`
  const city = inferCity(event)
  const dateTitle = formatDateForTitle(event.startDate)
  const title = `${event.title} - ${city} - ${dateTitle} - ${APP_NAME}`

  const rawDescription = event.description?.trim() || 'Discover this live event and reserve your spot.'
  const venueText = event.venue?.name ? ` at ${event.venue.name}` : ''
  const metaDescription = trimTo(`${rawDescription.slice(0, 120)}${venueText}. Book your spot now.`, 155)
  const imageUrl = event.imageUrl || `${siteUrl.replace(/\/$/, '')}/icon-512.png`

  return {
    title,
    description: metaDescription,
    alternates: {
      canonical: `/events/${pathPart}`,
    },
    openGraph: {
      title,
      description: metaDescription,
      url,
      siteName: APP_NAME,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: metaDescription,
      images: [imageUrl],
    },
    other: {
      'og:type': 'event',
    },
  }
}

export function buildEventListMetadata(eventCount?: number): Metadata {
  const countText = typeof eventCount === 'number' ? ` Browse ${eventCount} upcoming events.` : ' Browse upcoming events.'
  return {
    title: `Open Mic Events - ${APP_NAME}`,
    description: trimTo(`Find upcoming open mics and performance events on ${APP_NAME}.${countText}`, 155),
    alternates: { canonical: '/events' },
  }
}

export function buildPerformerMetadata(profile: PublicPerformerProfile): Metadata {
  const description = trimTo(
    profile.bio?.trim() || `View upcoming performances and profile details for ${profile.fullName}.`,
    155
  )
  const imageUrl = profile.avatarUrl || `${getSiteUrl().replace(/\/$/, '')}/icon-512.png`
  return {
    title: `${profile.fullName} - Stand Up Comedian - ${APP_NAME}`,
    description,
    alternates: {
      canonical: `/profile/${profile.id}`,
    },
    openGraph: {
      title: `${profile.fullName} - ${APP_NAME}`,
      description,
      url: `${getSiteUrl().replace(/\/$/, '')}/profile/${profile.id}`,
      siteName: APP_NAME,
      images: [{ url: imageUrl }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${profile.fullName} - ${APP_NAME}`,
      description,
      images: [imageUrl],
    },
  }
}
