'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  MapPin,
  Car,
  Accessibility,
  UtensilsCrossed,
  Wine,
  Globe,
  Star,
  ExternalLink,
  CalendarDays,
  Mic,
  AlertCircle,
} from 'lucide-react'
import { formatDateTime } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'
import { CalBookingsCalendar } from '@/components/venue/CalBookingsCalendar'

type VenuePublic = {
  id: string
  name: string
  address: string
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  drinks_available: boolean
  description: string | null
  google_review_url: string | null
  website_url: string | null
}

type ShowEvent = {
  id: string
  slug: string | null
  title: string
  date: string
  credits_required: number
  event_type: string
  max_attendees: number | null
}

export default function VenuePublicPage() {
  const { id: venueId } = useParams<{ id: string }>()
  const [venue, setVenue] = useState<VenuePublic | null>(null)
  const [shows, setShows] = useState<ShowEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    void load()
  }, [venueId])

  async function load() {
    setLoading(true)
    try {
      const [{ data: venueData, error: venueError }, { data: eventsData }] = await Promise.all([
        supabase.from('venues').select('*').eq('id', venueId).single(),
        supabase
          .from('events')
          .select('id, slug, title, date, credits_required, event_type, max_attendees')
          .eq('venue_id', venueId)
          .gte('date', new Date().toISOString())
          .not('status', 'in', '("cancelled","archived","draft","pending_approval","private")')
          .order('date', { ascending: true })
          .limit(30),
      ])

      if (venueError || !venueData) {
        setNotFound(true)
        return
      }

      setVenue(venueData as unknown as VenuePublic)
      setShows((eventsData ?? []) as unknown as ShowEvent[])
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-28">
        {/* Hero skeleton */}
        <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 px-4 py-10 sm:px-6">
          <div className="mx-auto max-w-2xl space-y-3">
            <Skeleton className="h-9 w-56 bg-white/10" />
            <Skeleton className="h-5 w-72 bg-white/10" />
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-9 w-28 rounded-full bg-white/10" />
              <Skeleton className="h-9 w-28 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (notFound || !venue) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 pb-28 text-center">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="font-medium">Venue not found</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard">Browse events</Link>
        </Button>
      </div>
    )
  }

  const fullAddress = [venue.address, venue.city, venue.region, venue.postal_code, venue.country]
    .filter(Boolean)
    .join(', ')

  const googleMapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null

  const amenities = [
    venue.food_drinks_available && { icon: UtensilsCrossed, label: 'Food & drinks' },
    venue.drinks_available && { icon: Wine, label: 'Drinks available' },
    venue.parking_options && { icon: Car, label: venue.parking_options },
    venue.accessibility && { icon: Accessibility, label: venue.accessibility },
  ].filter(Boolean) as Array<{ icon: React.ElementType; label: string }>

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* ── Hero banner ──────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 px-4 py-10 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{venue.name}</h1>
          {fullAddress && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-400">
              <MapPin className="h-4 w-4 shrink-0" />
              {fullAddress}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {googleMapsUrl && (
              <Button
                asChild
                size="sm"
                className="gap-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border-0"
                variant="outline"
              >
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="h-3.5 w-3.5" />
                  Get directions
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {venue.google_review_url && (
              <Button
                asChild
                size="sm"
                className="gap-1.5 rounded-full bg-amber-500/90 text-white hover:bg-amber-400 border-0"
                variant="outline"
              >
                <a href={venue.google_review_url} target="_blank" rel="noopener noreferrer">
                  <Star className="h-3.5 w-3.5" />
                  Leave a review
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
            {venue.website_url && (
              <Button
                asChild
                size="sm"
                className="gap-1.5 rounded-full bg-white/10 text-white hover:bg-white/20 border-0"
                variant="outline"
              >
                <a href={venue.website_url} target="_blank" rel="noopener noreferrer">
                  <Globe className="h-3.5 w-3.5" />
                  Website
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:px-6">
        {/* ── About ──────────────────────────────────────────────────────── */}
        {venue.description && (
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              About
            </h2>
            <p className="text-sm leading-relaxed text-foreground">{venue.description}</p>
          </section>
        )}

        {/* ── Amenities ──────────────────────────────────────────────────── */}
        {amenities.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Amenities & access
            </h2>
            <div className="flex flex-wrap gap-2">
              {amenities.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-foreground"
                >
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {label}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ── Upcoming shows ─────────────────────────────────────────────── */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            Upcoming shows
          </h2>

          {shows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-muted-foreground/30 py-12 text-center">
              <Mic className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
              <p className="font-medium text-foreground">No shows scheduled yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Check back soon — events are added regularly.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {shows.map((ev) => {
                const href = `/events/${ev.slug ?? ev.id}`
                const isFree = ev.credits_required <= 0
                return (
                  <li key={ev.id}>
                    <Link
                      href={href}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm transition-shadow hover:shadow-md"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">{ev.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatDateTime(ev.date)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge
                          variant={isFree ? 'secondary' : 'outline'}
                          className={cn(
                            'text-xs',
                            isFree && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
                          )}
                        >
                          {isFree ? 'Free' : `${ev.credits_required} credits`}
                        </Badge>
                        {ev.event_type === 'open_mic' && (
                          <span className="text-[10px] text-muted-foreground">Open Mic</span>
                        )}
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ── Booking calendar (Ryan's Chai only) ───────────────────────── */}
        {venue.name.toLowerCase() === "ryan's chai" && (
          <section className="space-y-2">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Venue availability
            </h2>
            <p className="text-sm text-muted-foreground">
              See when the space is booked. Amber = upcoming shows · Indigo = venue reservations.
            </p>
            <CalBookingsCalendar venueId={venueId} showDetails={false} />
          </section>
        )}

        {/* ── Google review CTA (bottom) ─────────────────────────────────── */}
        {venue.google_review_url && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-5 dark:border-amber-800 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <Star className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div className="flex-1">
                <p className="font-semibold">Enjoyed a show here?</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Leave a Google review and help others discover {venue.name}.
                </p>
                <Button
                  asChild
                  size="sm"
                  className="mt-3 gap-1.5 bg-amber-500 text-white hover:bg-amber-400"
                >
                  <a href={venue.google_review_url} target="_blank" rel="noopener noreferrer">
                    <Star className="h-3.5 w-3.5" />
                    Write a review
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
