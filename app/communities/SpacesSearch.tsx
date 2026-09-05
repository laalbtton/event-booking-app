'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MapPin, Car, Accessibility, UtensilsCrossed, Wine, Globe, Star, CalendarDays } from 'lucide-react'
import type { PublicVenue } from '@/lib/server/publicVenues'
import { venuePublicPath } from '@/lib/venuePaths'

type Props = {
  venues: PublicVenue[]
}

export function SpacesSearch({ venues }: Props) {
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? venues.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          (v.description ?? '').toLowerCase().includes(q) ||
          (v.city ?? '').toLowerCase().includes(q) ||
          (v.address ?? '').toLowerCase().includes(q),
      )
    : venues

  const active = filtered.filter((v) => v.upcomingEventCount > 0)
  const inactive = filtered.filter((v) => v.upcomingEventCount === 0)

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <Input
          placeholder="Search spaces…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border bg-muted/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {query ? `No spaces found for "${query}".` : 'No spaces available yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active venues */}
          {active.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Active venues
              </h2>
              <div className="space-y-3">
                {active.map((venue) => <VenueCard key={venue.id} venue={venue} />)}
              </div>
            </section>
          )}

          {/* Inactive venues */}
          {inactive.length > 0 && (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                No upcoming shows
              </h2>
              <div className="space-y-3">
                {inactive.map((venue) => <VenueCard key={venue.id} venue={venue} muted />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function VenueCard({ venue, muted = false }: { venue: PublicVenue; muted?: boolean }) {
  const location = [venue.city, venue.region, venue.country].filter(Boolean).join(', ')

  const amenities = [
    venue.food_drinks_available && 'Food & drinks',
    venue.drinks_available && 'Drinks',
    venue.parking_options,
    venue.accessibility,
  ].filter(Boolean) as string[]

  return (
    <Link
      href={venuePublicPath(venue)}
      className={`block rounded-xl border border-red-600/25 bg-card p-4 hover:shadow-md hover:border-red-600/45 transition-all group ${muted ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1.5">
          <h3 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
            {venue.name}
          </h3>

          {venue.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{venue.description}</p>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {(location || venue.address) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3 shrink-0" />
                {location || venue.address}
              </span>
            )}
            {venue.upcomingEventCount > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <CalendarDays className="h-3 w-3" />
                {venue.upcomingEventCount} upcoming show{venue.upcomingEventCount !== 1 ? 's' : ''}
              </span>
            )}
            {venue.website_url && (
              <span className="inline-flex items-center gap-1">
                <Globe className="h-3 w-3" />
                Website
              </span>
            )}
            {venue.google_review_url && (
              <span className="inline-flex items-center gap-1 text-amber-500">
                <Star className="h-3 w-3" />
                Reviews
              </span>
            )}
          </div>

          {amenities.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {venue.food_drinks_available && (
                <Badge variant="secondary" className="gap-1 text-xs py-0 px-1.5 font-normal">
                  <UtensilsCrossed className="h-3 w-3" />
                  Food & drinks
                </Badge>
              )}
              {venue.drinks_available && !venue.food_drinks_available && (
                <Badge variant="secondary" className="gap-1 text-xs py-0 px-1.5 font-normal">
                  <Wine className="h-3 w-3" />
                  Drinks
                </Badge>
              )}
              {venue.parking_options && (
                <Badge variant="outline" className="gap-1 text-xs py-0 px-1.5 font-normal">
                  <Car className="h-3 w-3" />
                  Parking
                </Badge>
              )}
              {venue.accessibility && (
                <Badge variant="outline" className="gap-1 text-xs py-0 px-1.5 font-normal">
                  <Accessibility className="h-3 w-3" />
                  Accessible
                </Badge>
              )}
            </div>
          )}
        </div>

        <svg
          className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  )
}
