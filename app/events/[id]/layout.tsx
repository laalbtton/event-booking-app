import type { ReactNode } from 'react'
import { getPublicEventByIdentifier } from '@/lib/server/publicContent'
import { buildEventMetadata, getSiteUrl } from '@/lib/seo/metadata'
import { buildEventJsonLd } from '@/lib/seo/schemaEvent'
import { PublicEventCTA } from '@/components/public/PublicEventCTA'
import { PublicInstallBanner } from '@/components/public/PublicInstallBanner'
import { PublicHeader } from '@/components/public/PublicHeader'
import type { Metadata } from 'next'

// Cache event detail pages for 5 minutes — keeps spot counts reasonably fresh
export const revalidate = 300

type Props = {
  children: ReactNode
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Pick<Props, 'params'>): Promise<Metadata> {
  const { id } = await params
  const event = await getPublicEventByIdentifier(id)
  if (!event) {
    return {
      title: 'Event Not Found - One Mic Stand',
      robots: { index: false, follow: false },
    }
  }
  return buildEventMetadata(event)
}

export default async function EventLayout({ children, params }: Props) {
  const { id } = await params
  const event = await getPublicEventByIdentifier(id)

  if (!event) {
    return <>{children}</>
  }

  const jsonLd = buildEventJsonLd(event, getSiteUrl())

  const isPast = new Date(event.startDate) < new Date()
  const eventSlug = event.slug || event.id

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-CA', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    })
  }
  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <>
      {/* JSON-LD structured data — rendered server-side in the HTML body.
          Google reads JSON-LD from anywhere in the document, not just <head>. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Public navigation header — hidden for logged-in users after hydration */}
      <PublicHeader />

      {/* Hidden section for crawlers with key event facts */}
      <section className="sr-only">
        <h1>{event.title}</h1>
        <p>{event.description}</p>
        <p>{new Date(event.startDate).toISOString()}</p>
        {event.endDate && <p>{new Date(event.endDate).toISOString()}</p>}
        <p>{event.venue?.name || 'Venue TBA'}</p>
        <p>{event.venue?.address || event.locationText}</p>
        <p>{event.venue?.city || ''}</p>
        <p>{event.venue?.region || ''}</p>
        <p>{event.isFree ? 'Free Event' : 'Ticketed Event'}</p>
        <p>{event.organizerName}</p>
        {event.performerLineup.length > 0 && (
          <ul>
            {event.performerLineup.map((performer) => (
              <li key={`${performer.id}-${performer.status}`}>{performer.name}</li>
            ))}
          </ul>
        )}
      </section>

      {/* Server-rendered visible event summary for logged-out visitors.
          The page.tsx client component renders the full interactive view after hydration.
          This section is always visible immediately, before JS executes. */}
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-2 space-y-4" aria-hidden="false">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
          {event.communityName && (
            <p className="text-sm text-muted-foreground">{event.communityName}</p>
          )}
        </div>

        <div className="space-y-2 text-sm text-muted-foreground">
          <p className="flex items-center gap-2">
            <span>📅</span>
            <span>{formatDate(event.startDate)} · {formatTime(event.startDate)}{event.endDate ? ` – ${formatTime(event.endDate)}` : ''}</span>
          </p>
          {(event.venue || event.locationText) && (
            <p className="flex items-center gap-2">
              <span>📍</span>
              <span>
                {event.venue
                  ? `${event.venue.name}, ${[event.venue.address, event.venue.city, event.venue.region].filter(Boolean).join(', ')}`
                  : event.locationText}
              </span>
            </p>
          )}
          <p className="flex items-center gap-2">
            <span>🎤</span>
            <span>{event.spotsConfirmed} performer{event.spotsConfirmed !== 1 ? 's' : ''} signed up</span>
          </p>
          <p className="flex items-center gap-2">
            <span>{event.isFree ? '🆓' : '🎟️'}</span>
            <span>
              {event.isFree
                ? 'Free event'
                : event.ticketPriceCents
                  ? `Tickets from $${(event.ticketPriceCents / 100).toFixed(2)}`
                  : 'Ticketed event'}
            </span>
          </p>
        </div>

        {event.description && (
          <p className="text-sm leading-relaxed line-clamp-4">{event.description}</p>
        )}

        {/* Confirmed performer lineup */}
        {event.performerLineup.filter((p) => p.status === 'confirmed').length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Lineup</p>
            <ul className="space-y-1">
              {event.performerLineup
                .filter((p) => p.status === 'confirmed')
                .map((performer) => (
                  <li key={performer.id} className="text-sm flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs">🎤</span>
                    {performer.name}
                    {performer.artTypeName && <span className="text-xs text-muted-foreground">({performer.artTypeName})</span>}
                  </li>
                ))}
            </ul>
          </div>
        )}

        {/* Public CTA — shown to logged-out visitors; self-hides for logged-in users after hydration */}
        <PublicEventCTA
          eventSlug={eventSlug}
          isCancelled={event.isCancelled}
          isPast={isPast}
        />

        {/* PWA install banner for mobile */}
        <PublicInstallBanner />
      </div>

      {/* The full interactive event page (client component) renders below */}
      {children}
    </>
  )
}
