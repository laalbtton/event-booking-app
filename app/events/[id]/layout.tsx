import type { ReactNode } from 'react'
import Link from 'next/link'
import { getPublicEventByIdentifier } from '@/lib/server/publicContent'
import { buildEventMetadata, getSiteUrl } from '@/lib/seo/metadata'
import { buildEventJsonLd } from '@/lib/seo/schemaEvent'
import { PublicEventCTA } from '@/components/public/PublicEventCTA'
import { PublicInstallBanner } from '@/components/public/PublicInstallBanner'
import { PublicHeader } from '@/components/public/PublicHeader'
import { LayoutEventSummary } from '@/components/public/LayoutEventSummary'
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

      {/* Server-rendered visible event summary — shown only to logged-out visitors.
          LayoutEventSummary hides this once auth resolves and a user is detected,
          preventing duplicate content for logged-in users. */}
      <LayoutEventSummary>
        <div className="mx-auto max-w-2xl px-4 pt-6 pb-2 space-y-4">
          {/* Event poster */}
          {event.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.imageUrl}
              alt={`${event.title} poster`}
              className="w-full rounded-xl object-cover max-h-72"
            />
          )}

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

          {event.performerLineup.filter((p) => p.status === 'confirmed').length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Lineup ({event.performerLineup.filter((p) => p.status === 'confirmed').length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {event.performerLineup
                  .filter((p) => p.status === 'confirmed')
                  .map((performer, index) => (
                    <Link
                      key={performer.id}
                      href={`/profile/${performer.id}`}
                      className="flex items-center gap-2 p-2 bg-muted/40 rounded-lg border border-border hover:border-muted-foreground/40 hover:bg-muted/60 transition-all"
                    >
                      {/* Position number */}
                      <span className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-muted-foreground/40">
                        {index + 1}
                      </span>

                      {/* Name + art type */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate hover:text-primary transition-colors">
                          {performer.name}
                        </p>
                        {performer.artTypeName && (
                          <p className="text-xs text-muted-foreground truncate">{performer.artTypeName}</p>
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="h-8 w-8 rounded-full bg-muted overflow-hidden shrink-0 flex items-center justify-center text-xs font-medium">
                        {performer.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={performer.avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span>
                            {performer.name.split(/\s+/).map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?'}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))}
              </div>
            </div>
          )}

          <PublicEventCTA
            eventSlug={eventSlug}
            eventId={event.id}
            isCancelled={event.isCancelled}
            isPast={isPast}
          />

          <PublicInstallBanner />
        </div>
      </LayoutEventSummary>

      {/* The full interactive event page (client component) renders below */}
      {children}
    </>
  )
}
