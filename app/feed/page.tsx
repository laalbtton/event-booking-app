'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { CalendarDays, MapPin, Users, UserPlus, Mic, Search, Pencil, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { resolveEventDisplayPosterUrl } from '@/lib/eventPosterDefaults'
import type { FeedEvent, FeedJoke, FeedReason } from '@/lib/server/follows'

type FeedFilter = 'all' | 'people' | 'communities' | 'jokes'

export default function FeedPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [jokes, setJokes] = useState<FeedJoke[]>([])
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
          setJokes((json.jokes ?? []) as FeedJoke[])
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
              Upcoming events from your communities and the people you follow, plus their latest
              jokes.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button asChild variant="outline" size="icon" aria-label="Find people to follow">
              <Link href="/feed/search">
                <Search className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/feed/following">
                Following{followingCount > 0 ? ` · ${followingCount}` : ''}
              </Link>
            </Button>
          </div>
        </div>

        {jokes.length > 0 && filter !== 'jokes' && (
          <button
            type="button"
            onClick={() => setFilter('jokes')}
            className="w-full flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-left text-sm hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 min-w-0">
              {jokes.length === 1
                ? '1 recent joke from someone you follow'
                : `${jokes.length} recent jokes from people you follow`}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        )}

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
          <FilterChip active={filter === 'jokes'} onClick={() => setFilter('jokes')}>
            Jokes ({jokes.length})
          </FilterChip>
        </div>

        {filter === 'jokes' ? (
          jokes.length === 0 ? (
            <JokesEmptyState followingCount={followingCount} />
          ) : (
            <div className="space-y-4">
              {jokes.map((joke) => (
                <FeedJokeCard key={joke.id} joke={joke} />
              ))}
            </div>
          )
        ) : visibleEvents.length === 0 ? (
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

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr)
  const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

function FeedJokeCard({ joke }: { joke: FeedJoke }) {
  const profileHref = `/profile/${joke.authorUsername || joke.authorId}`
  // Labels match the reaction wording on /jokes. Read-only here — reacting
  // happens on the jokes page itself.
  const counts = [
    { label: 'Like', value: joke.reactions.like },
    { label: 'Alright', value: joke.reactions.bomb },
    { label: 'Killed', value: joke.reactions.kill },
    { label: 'Laughter', value: joke.reactions.laughter },
  ].filter((entry) => entry.value > 0)

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Link href={profileHref} className="shrink-0">
            <Avatar className="h-8 w-8">
              {joke.authorAvatarUrl && (
                <AvatarImage src={joke.authorAvatarUrl} alt={joke.authorName || 'Author'} />
              )}
              <AvatarFallback className="text-[11px]">
                {initialsOf(joke.authorName || '')}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="min-w-0 flex-1">
            <Link href={profileHref} className="block font-medium text-sm truncate hover:underline">
              {joke.authorName || 'Someone you follow'}
            </Link>
            <p className="text-xs text-muted-foreground">{timeAgo(joke.createdAt)}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed whitespace-pre-wrap">{joke.content}</p>

        {counts.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {counts.map((entry) => (
              <Badge key={entry.label} variant="secondary" className="text-[10px]">
                {entry.label} {entry.value}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function JokesEmptyState({ followingCount }: { followingCount: number }) {
  return (
    <Card>
      <CardContent className="p-6 text-center space-y-3">
        <Pencil className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="font-medium">No jokes yet</p>
        <p className="text-sm text-muted-foreground">
          {followingCount === 0
            ? 'Follow a few comics and their jokes will show up here.'
            : 'Nobody you follow has written a joke yet. Browse what everyone else is writing in the meantime.'}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/jokes">Open Jokes</Link>
          </Button>
          {followingCount === 0 && (
            <Button asChild size="sm">
              <Link href="/feed/search">Find people</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

type PersonReason = Exclude<FeedReason, { kind: 'community' }>

const MAX_FACES = 4

function initialsOf(name: string): string {
  if (!name.trim()) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/**
 * The people you follow who are on this lineup, as faces rather than names — the
 * point of the feed is recognising someone at a glance. The host is ringed to set
 * them apart, and names live in the tooltip plus a screen-reader summary.
 */
function FollowedFacePile({ reasons }: { reasons: PersonReason[] }) {
  if (reasons.length === 0) return null

  const shown = reasons.slice(0, MAX_FACES)
  const overflow = reasons.length - shown.length
  const describe = (r: PersonReason) =>
    `${r.label} is ${r.kind === 'host' ? 'hosting' : 'performing'}`

  return (
    <div className="flex items-center">
      <span className="sr-only">{reasons.map(describe).join('. ')}.</span>
      <div className="flex -space-x-2" aria-hidden="true">
        {shown.map((r) => (
          <Avatar
            key={`${r.kind}-${r.id}`}
            title={describe(r)}
            className={`h-7 w-7 border-2 border-background ${
              r.kind === 'host' ? 'ring-2 ring-primary' : ''
            }`}
          >
            {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt="" />}
            <AvatarFallback className="text-[10px]">{initialsOf(r.label)}</AvatarFallback>
          </Avatar>
        ))}
        {overflow > 0 && (
          <span className="h-7 w-7 rounded-full border-2 border-background bg-muted text-[10px] font-medium text-muted-foreground flex items-center justify-center">
            +{overflow}
          </span>
        )}
      </div>
    </div>
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

  const peopleReasons = event.reasons.filter((r): r is PersonReason => r.kind !== 'community')
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <FollowedFacePile reasons={peopleReasons} />
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
            Search for someone by name, or open a performer&apos;s profile and tap Follow. When they
            have a gig coming up, it shows here.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link href="/feed/search">Find people</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/dashboard">Browse events</Link>
            </Button>
          </div>
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
          <Button asChild size="sm">
            <Link href="/feed/search">Find people</Link>
          </Button>
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
