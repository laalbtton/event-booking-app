import type { ReactNode } from 'react'
import { getPublicEventByIdentifier } from '@/lib/server/publicContent'
import { buildEventMetadata, getSiteUrl } from '@/lib/seo/metadata'
import { buildEventJsonLd } from '@/lib/seo/schemaEvent'
import type { Metadata } from 'next'

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

  return (
    <>
      {/* JSON-LD structured data — rendered server-side in the HTML body.
          Google reads JSON-LD from anywhere in the document, not just <head>. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
      {children}
    </>
  )
}
