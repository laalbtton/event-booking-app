'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CalendarDays, MapPin, Users, UserPlus, Mic } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { resolveEventDisplayPosterUrl } from '@/lib/eventPosterDefaults'
import type { FeedEvent } from '@/lib/server/follows'

type FeedFilter = 'all' | 'people' | 'communities'

export default function FeedPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [followingCount, setFollowingCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FeedFilter>('all')

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.push('/login')
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token) throw new Error('Not authenticated')

        const res = await fetch('/api/feed', { headers: { Authorization: `Bearer ${token}` } })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load feed')

        if (!cancelled) {
          setEvents((json.events ?? []) as FeedEvent[])
          setFollowingCount(typeof json.followingCount === 'number' ? json.followingCount : 0)
        }
      } catch (err: unknown) {
        if (!cancelled) toast.error(err instanceof Error ? err.message : 'Failed to load feed')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, user, router])

  const visibleEvents = useMemo(() => {
    if (filter === 'people') {
      return events.filter((e) => e.reasons.some((r) => r.kind === 'host' || r.kind === 'performer'))
    }
    if (filter === 'communities') {
      return events.filter((e) => e.reasons.some((r) => r.kind === 'community'))
    }
    return events
  }, [events, filter])

  const peopleCount = useMemo(
    () => events.filter((e) => e.reasons.some((r) => r.kind !== 'community')).length,
    [events],
  )

  const communityCount = useMemo(
    () => events.filter((e) => e.reasons.some((r) => r.kind === 'community')).length,
    [events],
  )

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading your feed…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:px-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Your feed</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Upcoming events from your communities and the people you follow.
            </p>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/feed/following">
              Following{followingCount > 0 ? ` · ${followingCount}` : ''}
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            All events ({events.length})
          </FilterChip>
          <FilterChip active={filter === 'people'} onClick={() => setFilter('people')}>
            From people you follow ({peopleCount})
          </FilterChip>
          <FilterChip active={filter === 'communities'} onClick={() => setFilter('communities')}>
            From my communities ({communityCount})
          </FilterChip>
        </div>

        {visibleEvents.length === 0 ? (
          <EmptyState filter={filter} followingCount={followingCount} />
        ) : (
          <div className="space-y-4">
            {visibleEvents.map((event) => (
              <FeedEventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  )
}

function FeedEventCard({ event }: { event: FeedEvent }) {
  const href = `/events/${event.slug || event.id}`
  const posterUrl = resolveEventDisplayPosterUrl({
    posterUrl: event.posterUrl,
    startDate: event.date,
    locationText: event.location || '',
    venue: event.venueName ? { name: event.venueName, city: event.venueCity ?? undefined } : null,
    eventType: event.eventType,
    openMicType: event.openMicType,
    title: event.title,
  })

  const peopleReasons = event.reasons.filter((r) => r.kind !== 'community')
  const communityReasons = event.reasons.filter((r) => r.kind === 'community')
  const locationLabel = [event.venueName, event.venueCity].filter(Boolean).join(', ') || event.location

  return (
    <Card className="overflow-hidden shadow-sm">
      <Link href={href} className="block hover:bg-muted/40 transition-colors">
        <CardContent className="p-4 flex gap-4">
          {posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={posterUrl}
              alt=""
              className="hidden sm:block h-24 w-24 rounded-lg object-cover shrink-0"
            />
          )}

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {peopleReasons.map((r) => (
                <Badge key={`${r.kind}-${r.id}`} variant="default" className="text-[11px] font-medium">
                  {r.kind === 'host' ? `${r.label} is hosting` : `${r.label} is performing`}
                </Badge>
              ))}
              {communityReasons.map((r) => (
                <Badge key={`community-${r.id}`} variant="secondary" className="text-[11px]">
                  {r.label}
                </Badge>
              ))}
            </div>

            <h2 className="font-semibold leading-snug truncate">{event.title}</h2>

            <div className="space-y-1 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {formatDateTimeEastern(event.date)}
              </p>
              {locationLabel && (
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{locationLabel}</span>
                </p>
              )}
              <p className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 shrink-0" />
                {event.confirmedPerformers}
                {event.maxAttendees ? ` / ${event.maxAttendees}` : ''} performing
                {event.hostName ? ` · hosted by ${event.hostName}` : ''}
              </p>
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  )
}

function EmptyState({ filter, followingCount }: { filter: FeedFilter; followingCount: number }) {
  if (filter === 'people' && followingCount === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <UserPlus className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">You&apos;re not following anyone yet</p>
          <p className="text-sm text-muted-foreground">
            Open a performer&apos;s profile and tap Follow. When they have a gig coming up, it shows here.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Browse events</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  // You do follow people — they just have nothing booked yet. Say so, otherwise
  // the empty list reads as though the follows didn't save.
  if (filter === 'people') {
    return (
      <Card>
        <CardContent className="p-6 text-center space-y-3">
          <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="font-medium">No gigs coming up yet</p>
          <p className="text-sm text-muted-foreground">
            {followingCount === 1
              ? 'The person you follow has nothing on the calendar right now.'
              : `None of the ${followingCount} people you follow have anything on the calendar right now.`}{' '}
            You&apos;ll get a notification as soon as one of them books a spot or hosts a show.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/feed/following">See who you follow</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-6 text-center space-y-3">
        <Mic className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">Nothing coming up yet</p>
        <p className="text-sm text-muted-foreground">
          Join a community or follow a few performers to fill your feed.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/communities">Browse communities</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Browse events</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
