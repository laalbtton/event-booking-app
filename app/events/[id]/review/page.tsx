'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Event, EventReview } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ChevronLeft, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type PerformerOption = { id: string; fullName: string }

function isEventEnded(ev: { end_time: string | null; date: string }): boolean {
  const t = ev.end_time ? new Date(ev.end_time) : new Date(ev.date)
  return t.getTime() < Date.now()
}

function StarRow({
  value,
  onChange,
  disabled,
  name,
}: {
  value: number | null
  onChange: (n: number | null) => void
  disabled?: boolean
  name: string
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={name}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n === value ? null : n)}
          className={cn(
            'h-10 w-10 rounded-lg text-sm font-semibold border transition-colors',
            value != null && n <= value
              ? 'bg-yellow-500/20 border-yellow-500 text-yellow-300'
              : 'bg-zinc-800/80 border-zinc-600 text-stone-500 hover:border-zinc-500',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
          aria-pressed={value != null && n <= value}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

export default function EventReviewPage() {
  const params = useParams()
  const router = useRouter()
  const { authResolved, user } = useAuthBootstrap()
  const eventParam = (params.id as string) || ''

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [event, setEvent] = useState<Event | null>(null)
  const [resolvedId, setResolvedId] = useState<string | null>(null)
  const [myBooking, setMyBooking] = useState<{ id: string } | null>(null)
  const [performers, setPerformers] = useState<PerformerOption[]>([])
  const [existing, setExisting] = useState<EventReview | null>(null)

  const [hostRating, setHostRating] = useState<number | null>(null)
  const [creatorRating, setCreatorRating] = useState<number | null>(null)
  const [perfRating, setPerfRating] = useState<number | null>(null)
  const [perfUserId, setPerfUserId] = useState<string>('')
  const [comment, setComment] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let { data: eventData, error: evErr } = await supabase
        .from('events')
        .select(
          'id, title, date, end_time, status, host_user_id, created_by, slug, event_type',
        )
        .eq('id', eventParam)
        .maybeSingle()
      if (!eventData) {
        const fb = await supabase
          .from('events')
          .select('id, title, date, end_time, status, host_user_id, created_by, slug, event_type')
          .eq('slug', eventParam)
          .maybeSingle()
        eventData = fb.data
        evErr = fb.error
      }
      if (evErr || !eventData) {
        toast.error('Event not found')
        setEvent(null)
        return
      }
      const eid = eventData.id as string
      setResolvedId(eid)
      setEvent(eventData as Event)

      if ((eventData as { slug?: string | null }).slug && eventParam !== (eventData as { slug: string }).slug) {
        router.replace(`/events/${(eventData as { slug: string }).slug}/review`)
      }

      const { data: book } = await supabase
        .from('bookings')
        .select('id')
        .eq('event_id', eid)
        .eq('user_id', user.id)
        .eq('status', 'confirmed')
        .maybeSingle()
      setMyBooking(book as { id: string } | null)

      const { data: bRows } = await supabase
        .from('bookings')
        .select('user_id, booking_scope, profiles:user_id (id, full_name)')
        .eq('event_id', eid)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      const list: PerformerOption[] = []
      for (const row of (bRows || []) as any[]) {
        const scope = row.booking_scope
        if (scope !== 'performer' && scope != null) continue
        const p = row.profiles as { id: string; full_name: string | null } | null
        if (p?.id) {
          list.push({ id: p.id, fullName: p.full_name || 'Performer' })
        }
      }
      setPerformers(list)

      const { data: rev } = await supabase
        .from('event_reviews')
        .select('*')
        .eq('event_id', eid)
        .eq('reviewer_id', user.id)
        .maybeSingle()

      if (rev) {
        const r = rev as EventReview
        setExisting(r)
        setHostRating(r.host_rating)
        setCreatorRating(r.creator_rating)
        setPerfRating(r.performance_rating)
        setPerfUserId(r.performance_rated_user_id || '')
        setComment(r.comment || '')
      } else {
        setExisting(null)
        setHostRating(null)
        setCreatorRating(null)
        setPerfRating(null)
        setPerfUserId('')
        setComment('')
      }
    } finally {
      setLoading(false)
    }
  }, [user, eventParam, router])

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      return
    }
    void load()
  }, [authResolved, user, load])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user || !resolvedId) return
    if (!myBooking) {
      toast.error('You need a confirmed booking to leave a review')
      return
    }
    if (!event || !isEventEnded(event)) {
      toast.error('Reviews open after the event has ended')
      return
    }

    const hasHost = !!event.host_user_id
    const hasCreator = !!event.created_by
    const canPerf = performers.length > 0

    if (hostRating != null && !hasHost) {
      toast.error('This event has no host to rate')
      return
    }
    if (creatorRating != null && !hasCreator) {
      toast.error('This event has no listed creator to rate')
      return
    }
    if (perfRating != null) {
      if (!canPerf) {
        toast.error('No performers to rate for this event')
        return
      }
      if (!perfUserId) {
        toast.error('Choose a performer to rate')
        return
      }
    }

    const hasAny =
      (hostRating != null && hasHost) ||
      (creatorRating != null && hasCreator) ||
      (perfRating != null && !!perfUserId)
    if (!hasAny) {
      toast.error('Add at least one star rating')
      return
    }

    setSaving(true)
    try {
      const payload: Record<string, unknown> = {
        event_id: resolvedId,
        reviewer_id: user.id,
        comment: comment.trim() || null,
        host_rating: hasHost && hostRating != null ? hostRating : null,
        creator_rating: hasCreator && creatorRating != null ? creatorRating : null,
        performance_rating: perfRating,
        performance_rated_user_id: perfRating != null ? perfUserId : null,
      }

      if (existing) {
        const { error } = await supabase
          .from('event_reviews')
          .update({
            comment: payload.comment,
            host_rating: payload.host_rating,
            creator_rating: payload.creator_rating,
            performance_rating: payload.performance_rating,
            performance_rated_user_id: payload.performance_rated_user_id,
          })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('event_reviews').insert(payload)
        if (error) throw error
      }
      toast.success('Thanks! Your review was saved.')
      await load()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save review'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center bg-zinc-950 text-stone-400">
        <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-stone-200 px-4 py-10 max-w-lg mx-auto space-y-4">
        <p>Sign in to rate this event.</p>
        <Button asChild>
          <Link href={`/login?redirectTo=/events/${eventParam}/review`}>Log in</Link>
        </Button>
      </div>
    )
  }

  if (!event || !resolvedId) {
    return (
      <div className="min-h-screen bg-zinc-950 text-stone-200 px-4 py-10 max-w-lg mx-auto">
        <p>Event not found.</p>
        <Button variant="outline" asChild className="mt-4">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    )
  }

  const ended = isEventEnded(event)
  const segment = (event as { slug?: string | null }).slug || event.id
  const hasHost = !!event.host_user_id
  const hasCreator = !!event.created_by
  const canPerf = performers.length > 0

  return (
    <div className="min-h-screen bg-zinc-950 text-stone-200 pb-16">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={`/events/${segment}`}
            className="p-1 rounded-lg hover:bg-zinc-800 text-stone-400"
            aria-label="Back to event"
          >
            <ChevronLeft className="h-6 w-6" />
          </Link>
          <h1 className="text-xl font-bold text-yellow-400">Rate this show</h1>
        </div>
        <p className="text-stone-400 text-sm">{event.title}</p>

        {!myBooking && (
          <div className="rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-100 text-sm">
            You need a confirmed spot for this event to leave a review.
          </div>
        )}

        {myBooking && !ended && (
          <div className="rounded-xl border border-zinc-600 bg-zinc-900/80 p-4 text-stone-300 text-sm">
            Reviews open after the event ends. Check back later.
          </div>
        )}

        {myBooking && ended && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {hasHost && (
              <div className="space-y-2">
                <Label className="text-stone-200">Hosting</Label>
                <p className="text-xs text-stone-500">How was the event host?</p>
                <StarRow name="host" value={hostRating} onChange={setHostRating} />
              </div>
            )}

            {hasCreator && (
              <div className="space-y-2">
                <Label className="text-stone-200">Event creator</Label>
                <p className="text-xs text-stone-500">How was the organization and communication?</p>
                <StarRow name="creator" value={creatorRating} onChange={setCreatorRating} />
              </div>
            )}

            {canPerf && (
              <div className="space-y-2">
                <Label className="text-stone-200">Performer</Label>
                <p className="text-xs text-stone-500">Who are you rating for performance?</p>
                <select
                  className="w-full rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-sm text-stone-100"
                  value={perfUserId}
                  onChange={(e) => setPerfUserId(e.target.value)}
                >
                  <option value="">Select a performer (required if you set stars below)</option>
                  {performers
                    .filter((p) => p.id !== user.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))}
                </select>
                <Label className="text-stone-200 pt-1">Performance</Label>
                <StarRow
                  name="performance"
                  value={perfRating}
                  onChange={(n) => {
                    setPerfRating(n)
                    if (n == null) setPerfUserId('')
                  }}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-stone-200">Comment (optional)</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="What stood out? (optional)"
                className="min-h-[100px] bg-zinc-900 border-zinc-600 text-stone-100"
                maxLength={2000}
              />
            </div>

            {existing && (
              <p className="text-xs text-stone-500">You can update your review for this event.</p>
            )}

            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-yellow-500 text-zinc-950 hover:bg-yellow-400 font-semibold"
            >
              {saving ? 'Saving…' : existing ? 'Update review' : 'Submit review'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
