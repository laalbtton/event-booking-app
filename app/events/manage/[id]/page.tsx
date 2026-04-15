'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import {
  QrCode,
  Link as LinkIcon,
  Image as ImageIcon,
  Trash2,
  Copy,
  Edit,
  X,
  Users,
  ChevronLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MAX_CAPTION_CHARS } from '@/lib/posterCaption'
import { toast } from 'sonner'

type Venue = { id: string; name: string; address: string }

const MAX_POSTER_BYTES = 10 * 1024 * 1024

function venueDisplayName(event: Event, venues: Venue[]): string {
  const vid = (event as any).venue_id as string | undefined
  if (vid) {
    const v = venues.find((x) => x.id === vid)
    if (v?.name) return v.name
  }
  const loc = event.location || ''
  const first = loc.split(',')[0]?.trim()
  return first || loc || 'Venue TBD'
}

export default function EventManageDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = typeof params.id === 'string' ? params.id : ''
  const { confirm } = useConfirmDialog()

  const [loading, setLoading] = useState(true)
  const [event, setEvent] = useState<Event | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [posterJobSummary, setPosterJobSummary] = useState<{
    posted: number
    failed: number
    pending: number
    skipped: number
  } | null>(null)
  const [posterPublishMeta, setPosterPublishMeta] = useState<{
    count: number
    lastPublishedAt: string | null
  } | null>(null)

  const [posterUploadingId, setPosterUploadingId] = useState<string | null>(null)
  const [posterCaptionLoadingId, setPosterCaptionLoadingId] = useState<string | null>(null)
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)

  const [posterCaptionDraft, setPosterCaptionDraft] = useState<{
    eventId: string
    file: File
    previewUrl: string
    caption: string
  } | null>(null)
  const posterInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!id) return
    void load()
  }, [id])

  async function load() {
    setLoading(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!profile) {
        router.push('/dashboard')
        return
      }
      const { data: venuesData } = await supabase
        .from('venues')
        .select('id, name, address, status')
        .in('status', ['approved', 'pending'])
        .order('name', { ascending: true })

      setVenues(
        (venuesData || []).map((v: any) => ({
          id: v.id,
          name: v.status === 'pending' ? `${v.name} (pending approval)` : v.name,
          address: v.address,
        }))
      )

      const { data: ev, error } = await supabase.from('events').select('*, venue_id').eq('id', id).single()

      if (error || !ev) {
        toast.error('Event not found')
        router.push('/events/manage')
        return
      }

      if (profile.role === 'event_creator' && ev.created_by !== user.id) {
        toast.error('You can only view your own events')
        router.push('/events/manage')
        return
      }

      setEvent(ev as Event)

      const { data: jobs } = await supabase
        .from('social_post_jobs')
        .select('status')
        .eq('event_id', id)

      const summary = { posted: 0, failed: 0, pending: 0, skipped: 0 }
      for (const row of jobs || []) {
        if (row.status === 'posted') summary.posted += 1
        if (row.status === 'failed') summary.failed += 1
        if (row.status === 'pending' || row.status === 'processing') summary.pending += 1
        if (row.status === 'skipped') summary.skipped += 1
      }
      setPosterJobSummary(summary)

      const { data: pubRows } = await supabase
        .from('poster_publish_history')
        .select('published_at')
        .eq('event_id', id)
        .order('published_at', { ascending: false })

      const count = pubRows?.length ?? 0
      const lastPublishedAt = pubRows?.[0]?.published_at ?? null
      setPosterPublishMeta({ count, lastPublishedAt })
    } finally {
      setLoading(false)
    }
  }

  const isUpcoming = event ? new Date(event.date) >= new Date() : false

  function closePosterCaptionModal() {
    setPosterCaptionDraft((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl)
      return null
    })
  }

  async function handlePosterUpload(file: File) {
    if (!event) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > MAX_POSTER_BYTES) {
      toast.error('Poster file must be 10MB or smaller')
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setPosterCaptionLoadingId(event.id)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      let suggestedCaption = ''
      try {
        const suggestionResponse = await fetch('/api/posters/suggest-caption', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ eventId: event.id }),
        })
        const suggestionJson = await suggestionResponse.json().catch(() => ({}))
        if (suggestionResponse.ok && typeof suggestionJson.caption === 'string') {
          suggestedCaption = suggestionJson.caption.slice(0, MAX_CAPTION_CHARS)
        }
      } catch {
        /* optional */
      }

      setPosterCaptionDraft({
        eventId: event.id,
        file,
        previewUrl,
        caption: suggestedCaption,
      })
    } catch (error: any) {
      URL.revokeObjectURL(previewUrl)
      toast.error(error.message || 'Failed to prepare poster upload')
    } finally {
      setPosterCaptionLoadingId(null)
    }
  }

  async function confirmPosterCaption() {
    const draft = posterCaptionDraft
    if (!draft) return
    setPosterUploadingId(draft.eventId)
    try {
      const cleanName = draft.file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${draft.eventId}/${Date.now()}-${cleanName}`
      const { error: uploadError } = await supabase.storage
        .from('event-posters')
        .upload(path, draft.file, { upsert: false, cacheControl: '3600' })
      if (uploadError) throw uploadError
      const {
        data: { publicUrl },
      } = supabase.storage.from('event-posters').getPublicUrl(path)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')
      const trimmed = draft.caption.trim()
      const response = await fetch('/api/posters/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          eventId: draft.eventId,
          action: 'set',
          posterUrl: publicUrl,
          posterCaption: trimmed.length > 0 ? trimmed : null,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to save poster')
      URL.revokeObjectURL(draft.previewUrl)
      setPosterCaptionDraft(null)
      toast.success(`Poster saved. Queued ${result.jobs?.jobsQueued || 0} auto-post job(s).`)
      await load()
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload poster')
    } finally {
      setPosterUploadingId(null)
    }
  }

  async function handlePosterRemove() {
    if (!event) return
    const shouldProceed = await confirm({
      title: 'Remove poster?',
      message: 'Remove this event poster?',
      confirmText: 'Remove',
      cancelText: 'Keep',
      variant: 'destructive',
    })
    if (!shouldProceed) return
    setPosterUploadingId(event.id)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')
      const response = await fetch('/api/posters/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId: event.id, action: 'remove' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to remove poster')
      toast.success('Poster removed')
      await load()
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove poster')
    } finally {
      setPosterUploadingId(null)
    }
  }

  async function handleCancelEvent() {
    if (!event) return
    const shouldProceed = await confirm({
      title: 'Cancel event?',
      message: `Cancel "${event.title}" and refund all attendees? This cannot be undone.`,
      confirmText: 'Yes, cancel event',
      cancelText: 'Keep event',
      variant: 'destructive',
    })
    if (!shouldProceed) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')
      const response = await fetch('/api/cancel-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId: event.id }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to cancel event')
      }
      const data = await response.json()
      if (data.alreadyCancelled) {
        toast.info('This event is already cancelled.')
        return
      }
      toast.success('Event cancelled and refunds processed.')
      router.push('/events/manage')
    } catch (error: any) {
      toast.error(error.message || 'Failed to cancel')
    }
  }

  function copyPublicLink() {
    if (!event) return
    const publicUrl = `${window.location.origin}/events/${event.slug || event.id}`
    navigator.clipboard.writeText(publicUrl)
    toast.success('Public link copied!')
  }

  if (loading || !event) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <Skeleton className="mb-4 h-10 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  const langs = Array.isArray((event as any).languages) ? (event as any).languages : ['English']
  const rawDescription = (event.description || '').trim()
  const descriptionLong = rawDescription.length > 280

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6">
          <Button variant="ghost" size="sm" className="-ml-2 mb-2 gap-1 text-muted-foreground" asChild>
            <Link href="/events/manage">
              <ChevronLeft className="h-4 w-4" />
              My Events
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">{event.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {event.status === 'cancelled' && <Badge variant="destructive">Cancelled</Badge>}
            {event.status === 'pending_approval' && <Badge variant="secondary">Pending Approval</Badge>}
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Event details</CardTitle>
            <CardDescription>Information shown on the public event page where applicable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="text-muted-foreground">
              {rawDescription ? (
                <>
                  <p
                    className={cn(
                      'whitespace-pre-wrap break-words',
                      !descriptionExpanded && descriptionLong && 'line-clamp-4'
                    )}
                  >
                    {rawDescription}
                  </p>
                  {descriptionLong && (
                    <button
                      type="button"
                      className="mt-1.5 text-sm font-medium text-primary hover:underline"
                      onClick={() => setDescriptionExpanded((e) => !e)}
                    >
                      {descriptionExpanded ? 'Show less' : 'Show full description'}
                    </button>
                  )}
                </>
              ) : (
                <p>—</p>
              )}
            </div>
            <div className="space-y-1.5 border-t pt-3">
              <p>
                <span className="font-medium text-foreground">When:</span> {formatDateTime(event.date)}
              </p>
              <p>
                <span className="font-medium text-foreground">Venue name:</span> {venueDisplayName(event, venues)}
              </p>
              <p>
                <span className="font-medium text-foreground">Address / location:</span> {event.location || '—'}
              </p>
              {event.theme && (
                <p>
                  <span className="font-medium text-foreground">Theme:</span> {event.theme}
                </p>
              )}
              <p>
                <span className="font-medium text-foreground">Rating:</span> {event.rating || '18+'}
              </p>
              {event.event_type === 'booked_show' ? (
                <p>
                  <span className="font-medium text-foreground">Format:</span> Booked show (invite only)
                </p>
              ) : (
                <p>
                  <span className="font-medium text-foreground">Performer credits:</span> {event.credits_required}
                </p>
              )}
              {event.max_attendees != null && (
                <p>
                  <span className="font-medium text-foreground">Max attendees:</span> {event.max_attendees}
                </p>
              )}
              {event.event_type !== 'booked_show' && (
                <p>
                  <span className="font-medium text-foreground">Cancellation policy:</span> Cancel up to{' '}
                  {event.cancellation_hours || 4} hours before
                </p>
              )}
              <p>
                <span className="font-medium text-foreground">Languages:</span> {langs.join(', ')}
              </p>
            </div>

            {event.poster_url && posterJobSummary && (
              <div className="border-t pt-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1 font-medium text-sky-700">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Poster on file
                </div>
                <p>
                  Auto-post jobs — Posted: {posterJobSummary.posted} | Pending: {posterJobSummary.pending} | Failed:{' '}
                  {posterJobSummary.failed}
                </p>
                {posterPublishMeta && (
                  <p>
                    Publishes: {posterPublishMeta.count}
                    {posterPublishMeta.lastPublishedAt
                      ? ` | Last: ${new Date(posterPublishMeta.lastPublishedAt).toLocaleString()}`
                      : ''}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {isUpcoming && event.status !== 'cancelled' && (
              <Button
                className="justify-start gap-2"
                variant="outline"
                onClick={() => router.push(`/events/manage?edit=${event.id}`)}
              >
                <Edit className="h-4 w-4" />
                Edit details
              </Button>
            )}
            <Button className="justify-start gap-2" variant="outline" asChild>
              <Link href={`/events/${event.id}/attendance`}>
                <Users className="h-4 w-4" />
                {isUpcoming ? 'Manage attendance' : 'View attendance'}
              </Link>
            </Button>
            <Button className="justify-start gap-2" variant="outline" type="button" onClick={copyPublicLink}>
              <LinkIcon className="h-4 w-4" />
              Copy public link
            </Button>
            {isUpcoming && (
              <>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  ref={posterInputRef}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handlePosterUpload(file)
                    e.currentTarget.value = ''
                  }}
                />
                <Button
                  className="justify-start gap-2"
                  variant="outline"
                  type="button"
                  disabled={
                    posterUploadingId === event.id ||
                    posterCaptionLoadingId === event.id ||
                    !!posterCaptionDraft
                  }
                  onClick={() => posterInputRef.current?.click()}
                >
                  <ImageIcon className="h-4 w-4" />
                  {posterCaptionLoadingId === event.id
                    ? 'Preparing…'
                    : posterUploadingId === event.id
                      ? 'Saving…'
                      : event.poster_url
                        ? 'Update poster'
                        : 'Add poster'}
                </Button>
                {event.poster_url && (
                  <Button
                    className="justify-start gap-2 text-rose-600"
                    variant="outline"
                    type="button"
                    disabled={
                      posterUploadingId === event.id ||
                      posterCaptionLoadingId === event.id ||
                      !!posterCaptionDraft
                    }
                    onClick={() => void handlePosterRemove()}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove poster
                  </Button>
                )}
                <Button className="justify-start gap-2" variant="outline" asChild>
                  <Link href={`/events/${event.id}/qr`}>
                    <QrCode className="h-4 w-4" />
                    Generate QR code
                  </Link>
                </Button>
              </>
            )}
            <Button
              className="justify-start gap-2"
              variant="outline"
              type="button"
              onClick={() => router.push(`/events/manage?duplicate=${event.id}`)}
            >
              <Copy className="h-4 w-4" />
              Duplicate event
            </Button>
            {isUpcoming && event.status !== 'cancelled' && (
              <Button
                className="justify-start gap-2 text-destructive"
                variant="outline"
                type="button"
                onClick={() => void handleCancelEvent()}
              >
                <X className="h-4 w-4" />
                Cancel event
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!posterCaptionDraft}
        onOpenChange={(open) => {
          if (!open) closePosterCaptionModal()
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Poster caption</DialogTitle>
            <DialogDescription>
              Preview your poster and edit the caption for sharing and auto-post.
            </DialogDescription>
          </DialogHeader>
          {posterCaptionDraft && (
            <div className="space-y-4">
              <div className="flex justify-center rounded-lg border bg-muted/30 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={posterCaptionDraft.previewUrl}
                  alt="Poster preview"
                  className="max-h-[220px] w-auto max-w-full rounded-md object-contain"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="poster-caption-detail">Caption</Label>
                  <span
                    className={cn(
                      'text-xs tabular-nums',
                      posterCaptionDraft.caption.length > MAX_CAPTION_CHARS * 0.95
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    {posterCaptionDraft.caption.length} / {MAX_CAPTION_CHARS}
                  </span>
                </div>
                <Textarea
                  id="poster-caption-detail"
                  value={posterCaptionDraft.caption}
                  onChange={(e) =>
                    setPosterCaptionDraft((d) =>
                      d ? { ...d, caption: e.target.value.slice(0, MAX_CAPTION_CHARS) } : null
                    )
                  }
                  rows={10}
                  placeholder="Write or edit your Instagram-style caption…"
                  className="min-h-[160px] resize-y font-sans text-sm"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => closePosterCaptionModal()}
              disabled={posterCaptionDraft ? posterUploadingId === posterCaptionDraft.eventId : false}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void confirmPosterCaption()}
              disabled={posterCaptionDraft ? posterUploadingId === posterCaptionDraft.eventId : true}
            >
              {posterCaptionDraft && posterUploadingId === posterCaptionDraft.eventId ? 'Saving…' : 'Save poster'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
