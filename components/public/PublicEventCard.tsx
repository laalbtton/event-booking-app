import Link from 'next/link'
import type { PublicEventDetails } from '@/lib/server/publicContent'

function formatEventDate(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatEventTime(dateIso: string): string {
  const d = new Date(dateIso)
  return d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
}

function getEventTypeLabel(eventType: string | null, openMicType: string | null): string {
  if (eventType === 'booked_show') return 'Booked Show'
  if (openMicType === 'variety_arts_open_mic') return 'Variety Arts Open Mic'
  return 'Comedy Open Mic'
}

type Props = {
  event: PublicEventDetails
  cityFilter?: string | null
}

export function PublicEventCard({ event, cityFilter }: Props) {
  const href = `/events/${event.slug || event.id}`
  const dateStr = formatEventDate(event.startDate)
  const timeStr = formatEventTime(event.startDate)
  const city = event.venue?.city || cityFromLocation(event.locationText)
  const venueName = event.venue?.name || event.locationText || 'Venue TBA'
  const typeLabel = getEventTypeLabel(event.eventType, event.openMicType)

  const isPast = new Date(event.startDate) < new Date()
  const highlightCity = cityFilter && city && city.toLowerCase().includes(cityFilter.toLowerCase())

  return (
    <Link
      href={href}
      className="group block rounded-xl border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow overflow-hidden"
    >
      {/* Event image */}
      <div className="relative h-40 w-full overflow-hidden bg-muted">
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.imageUrl}
            alt={event.title}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              const parent = target.parentElement
              if (parent) {
                const placeholder = parent.querySelector('[data-placeholder]') as HTMLElement | null
                if (placeholder) placeholder.style.display = 'flex'
              }
            }}
          />
        ) : null}
        <div
          data-placeholder
          className="flex h-full w-full items-center justify-center"
          style={{ display: event.imageUrl ? 'none' : 'flex' }}
        >
          <svg
            className="h-12 w-12 text-muted-foreground/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </div>
        {isPast && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
            <span className="text-white text-sm font-medium bg-black/60 px-2 py-1 rounded">Past Event</span>
          </div>
        )}
      </div>

      <div className="p-4 space-y-2">
        {/* Type badge + free/ticketed */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary">
            {typeLabel}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${event.isFree ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
            {event.isFree ? 'Free' : event.ticketPriceCents ? `$${(event.ticketPriceCents / 100).toFixed(0)}` : 'Ticketed'}
          </span>
          {event.ticketAvailability === 'SoldOut' && (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
              Sold Out
            </span>
          )}
        </div>

        {/* Title */}
        <h3 className="font-semibold text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {event.title}
        </h3>

        {/* Date + time */}
        <p className="text-sm text-muted-foreground flex items-center gap-1.5">
          <CalendarIcon />
          {dateStr} · {timeStr}
        </p>

        {/* Venue + city */}
        <p className={`text-sm flex items-center gap-1.5 ${highlightCity ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
          <LocationIcon />
          <span className="truncate">{venueName}{city && city !== venueName ? ` · ${city}` : ''}</span>
        </p>

        {/* Spots */}
        {!isPast && (
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <MicIcon />
            {event.spotsConfirmed} performer{event.spotsConfirmed !== 1 ? 's' : ''} signed up
          </p>
        )}

        {/* Community */}
        {event.communityName && (
          <p className="text-xs text-muted-foreground truncate">
            {event.communityName}
          </p>
        )}
      </div>
    </Link>
  )
}

function cityFromLocation(location: string | null): string {
  if (!location) return ''
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0] || ''
}

function CalendarIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}

function LocationIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  )
}
