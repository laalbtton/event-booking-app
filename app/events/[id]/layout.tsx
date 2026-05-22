import type { ReactNode } from 'react'
import Link from 'next/link'
import { getPublicEventByIdentifier } from '@/lib/server/publicContent'
import { buildEventMetadata, getSiteUrl } from '@/lib/seo/metadata'
import { buildEventJsonLd } from '@/lib/seo/schemaEvent'
import { PublicEventCTA } from '@/components/public/PublicEventCTA'
import { PublicInstallBanner } from '@/components/public/PublicInstallBanner'
import { INSTALL_PROMPT_ENABLED } from '@/lib/featureFlags'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventDateTime } from '@/components/public/PublicEventDateTime'
import { LayoutEventSummary } from '@/components/public/LayoutEventSummary'
import { ExpandableEventDescription } from '@/components/public/ExpandableEventDescription'
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
        <div className="min-h-screen bg-zinc-950">
          <div className="mx-auto max-w-2xl px-4 pt-6 pb-10 space-y-5">
            {/* Event poster — full-fit with dark letterbox matte */}
            {event.imageUrl && (
              <div className="w-full rounded-xl overflow-hidden bg-zinc-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.imageUrl}
                  alt={`${event.title} poster`}
                  className="w-full object-contain"
                />
              </div>
            )}

            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight text-yellow-400">{event.title}</h1>
              {event.communityName && (
                <p className="text-sm text-stone-400">{event.communityName}</p>
              )}
            </div>

            <div className="space-y-2 text-sm text-stone-400">
              <p className="flex items-center gap-2">
                <span>📅</span>
                <span>
                  <PublicEventDateTime startIso={event.startDate} endIso={event.endDate} />
                </span>
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
                {event.eventType === 'booked_show' ? (
                  <span>Special Acts</span>
                ) : (
                  <span>{event.spotsConfirmed} performer{event.spotsConfirmed !== 1 ? 's' : ''} signed up</span>
                )}
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
              <ExpandableEventDescription
                text={event.description}
                collapsedLines={4}
                textClassName="text-sm text-stone-300 leading-relaxed whitespace-pre-wrap break-words"
                buttonClassName="text-yellow-400 hover:text-yellow-300 underline underline-offset-2"
              />
            )}

            {event.performerLineup.filter((p) => p.status === 'confirmed').length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-3">
                  {event.eventType === 'booked_show' ? 'Special Acts' : `Lineup (${event.performerLineup.filter((p) => p.status === 'confirmed').length})`}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {event.performerLineup
                    .filter((p) => p.status === 'confirmed')
                    .map((performer, index) => (
                      <Link
                        key={performer.id}
                        href={`/profile/${performer.id}`}
                        className="flex items-center gap-2 p-2 bg-zinc-800/60 rounded-lg border border-zinc-700 hover:border-zinc-500 hover:bg-zinc-800 transition-all"
                      >
                        {/* Position number */}
                        <span className="h-8 w-8 rounded-full bg-zinc-700 text-stone-100 flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-zinc-600">
                          {index + 1}
                        </span>

                        {/* Name + art type */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-200 truncate hover:text-yellow-400 transition-colors">
                            {performer.name}
                          </p>
                          {performer.artTypeName && (
                            <p className="text-xs text-stone-500 truncate">{performer.artTypeName}</p>
                          )}
                        </div>

                        {/* Avatar */}
                        <div className="h-8 w-8 rounded-full bg-zinc-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-medium text-stone-300">
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
              eventType={event.eventType}
              isCancelled={event.isCancelled}
              isPast={isPast}
            />

            {INSTALL_PROMPT_ENABLED && <PublicInstallBanner />}
          </div>
        </div>
      </LayoutEventSummary>

      {/* The full interactive event page (client component) renders below */}
      {children}
    </>
  )
}
