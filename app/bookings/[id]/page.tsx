'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookingDetailSkeleton } from '@/components/skeletons/BookingDetailSkeleton'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { ChevronLeft } from 'lucide-react'
import { formatDateTime } from '@/lib/dateUtils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

type BookingWithEvent = {
  id: string
  status: string
  waitlist_position: number | null
  credits_used: number
  booking_scope: string
  audience_checkin_code?: string | null
  booked_at: string
  events: {
    id: string
    title: string
    description: string
    date: string
    location: unknown
    theme: string | null
    rating: string | null
    event_type: string
    cancellation_hours: number
    max_attendees: number | null
    status?: string | null
    languages?: string[]
  }
}

function formatLocationValue(value: unknown): string {
  if (!value) return 'TBD'
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null) {
    const v = value as { name?: string; address?: string; pathname?: string }
    if (v.name && v.address) return `${v.name}, ${v.address}`
    if (v.pathname) return v.pathname
  }
  return 'TBD'
}

function formatVenueName(value: unknown): string {
  const location = formatLocationValue(value)
  const [name] = location.split(',')
  return name.trim() || location
}

function formatEventLanguages(event: { languages?: string[] } | null): string {
  const langs = Array.isArray(event?.languages) ? event.languages : ['English']
  const cleaned = langs
    .map((l: string) => String(l || '').trim())
    .filter(Boolean)
    .filter((l: string, i: number, arr: string[]) => arr.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)
  const withEnglish = cleaned.some((l: string) => l.toLowerCase() === 'english') ? cleaned : [...cleaned, 'English']
  return [...withEnglish.filter((l: string) => l.toLowerCase() !== 'english'), 'English'].join(', ')
}

function getRatingDisplay(rating: string | null | undefined): string {
  const normalized = String(rating || '18+').trim()
  const isAllAges = normalized.toLowerCase().includes('all')
  return `${isAllAges ? '👨‍👩‍👧‍👦' : '🔞'} ${normalized}`
}

export default function BookingDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const bookingId = params.id as string
  const { confirm } = useConfirmDialog()
  const { authResolved, user } = useAuthBootstrap()

  const [booking, setBooking] = useState<BookingWithEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)
  const [confirmedCount, setConfirmedCount] = useState<number | null>(null)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }
    void loadBooking()
  }, [authResolved, user, bookingId, router])

  async function loadBooking() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          waitlist_position,
          credits_used,
          booking_scope,
          audience_checkin_code,
          booked_at,
          events (*)
        `)
        .eq('id', bookingId)
        .eq('user_id', user!.id)
        .single()

      if (error || !data) {
        setBooking(null)
        return
      }

      setBooking(data as unknown as BookingWithEvent)

      const eventId = (data as any).event_id ?? (data as any).events?.id
      if (eventId) {
        const { count } = await supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', eventId)
          .eq('status', 'confirmed')
          .neq('booking_scope', 'audience')
        setConfirmedCount(count ?? null)
      }
    } catch (err) {
      console.error('Error loading booking:', err)
      setBooking(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!booking || !user) return

    const event = booking.events
    const eventDate = new Date(event.date)
    const now = new Date()
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isBookedShow = event.event_type === 'booked_show'
    const cancellationWindow = isBookedShow ? 0 : (event.cancellation_hours || 4)
    const willGetRefund = !isBookedShow && hoursUntilEvent >= cancellationWindow
    const isAudienceBooking = booking.booking_scope === 'audience'

    let confirmMessage = ''
    if (booking.status === 'waitlist') {
      confirmMessage = isBookedShow
        ? `Remove yourself from the waitlist for "${event.title}"?`
        : isAudienceBooking && booking.credits_used === 0
          ? `Remove yourself from the waitlist for "${event.title}"?\n\nYour free audience pass will be restored.`
          : `Remove yourself from the waitlist for "${event.title}"?\n\nYou will receive a full refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
    } else {
      confirmMessage = isBookedShow
        ? `Cancel participation for "${event.title}"?`
        : willGetRefund
          ? isAudienceBooking && booking.credits_used === 0
            ? `Cancel registration for "${event.title}"?\n\nYour free audience pass will be restored.`
            : `Cancel registration for "${event.title}"?\n\nYou will receive a refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
          : `Cancel registration for "${event.title}"?\n\n⚠️ You will NOT receive a refund because cancellation is within ${cancellationWindow} hours of the event.\n\nAre you sure you want to cancel?`
    }

    const shouldProceed = await confirm({
      title: 'Confirm cancellation',
      message: confirmMessage,
      confirmText: booking.status === 'waitlist' ? 'Leave Waitlist' : 'Cancel Booking',
      cancelText: 'Keep Booking',
      variant: 'destructive',
    })
    if (!shouldProceed) return

    setCancelling(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to cancel booking')

      const refundedCredits = Number(result.refundedCredits || 0)
      const restoredFreePass = !!result.restoredFreePass

      if (restoredFreePass) {
        toast.success('Booking cancelled. Your free audience pass has been restored.')
      } else if (refundedCredits > 0) {
        const voucherNote = result.voucherRefunded ? ' Food coupon credits were also refunded.' : ''
        toast.success(
          `${booking.status === 'waitlist' ? 'Waitlist removed' : 'Booking cancelled'}. ${refundedCredits} credit${refundedCredits > 1 ? 's have' : ' has'} been refunded to your account.${voucherNote}`
        )
      } else {
        toast.info('Booking cancelled. No refund issued based on cancellation policy and voucher status.')
      }

      router.push('/profile')
    } catch (error: unknown) {
      toast.error('Error cancelling booking: ' + (error instanceof Error ? error.message : 'Unknown error'))
    } finally {
      setCancelling(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen bg-background">
        <BookingDetailSkeleton />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-4">Booking not found</h1>
          <p className="text-muted-foreground mb-4">This booking may have been cancelled or you don&apos;t have access to it.</p>
          <Button asChild variant="outline">
            <Link href="/profile">
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Profile
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const event = booking.events
  const isEventCancelled = event.status === 'cancelled'
  const isWaitlist = booking.status === 'waitlist'
  const isAudienceBooking = booking.booking_scope === 'audience'
  const isBookedShow = event.event_type === 'booked_show'
  const eventDate = new Date(event.date)
  const now = new Date()
  const diffMs = eventDate.getTime() - now.getTime()
  const isPast = diffMs < 0
  const hoursUntilEvent = diffMs / (1000 * 60 * 60)
  const cancellationWindow = isBookedShow ? 0 : (event.cancellation_hours || 4)
  const canCancel = hoursUntilEvent >= 0 && !isEventCancelled
  const willGetRefund = !isBookedShow && hoursUntilEvent >= cancellationWindow

  let timeDisplay = ''
  if (!isPast) {
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0 || days > 0) parts.push(`${hours}h`)
    if (days === 0) parts.push(`${minutes}m`)
    timeDisplay = parts.join(' ') || '0m'
  }

  const refundDeadline = new Date(eventDate.getTime() - cancellationWindow * 60 * 60 * 1000)
  const refundDiffMs = refundDeadline.getTime() - now.getTime()
  let refundTimeDisplay = ''
  if (refundDiffMs > 0) {
    const days = Math.floor(refundDiffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((refundDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((refundDiffMs % (1000 * 60 * 60)) / (1000 * 60))
    const parts = []
    if (days > 0) parts.push(`${days}d`)
    if (hours > 0 || days > 0) parts.push(`${hours}h`)
    if (days === 0) parts.push(`${minutes}m`)
    refundTimeDisplay = parts.join(' ') || '0m'
  }

  const spotsLeft = event.max_attendees != null && confirmedCount != null
    ? event.max_attendees - confirmedCount
    : null

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex items-center gap-2 mb-6">
          <Link
            href={`/events/${event.id}`}
            className="p-1 -ml-1 rounded hover:bg-muted"
            aria-label="Back to event"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Booking Details</h1>
        </div>

        <Card
          className={cn(
            'border-l-0 sm:border-l-4',
            isEventCancelled ? 'sm:border-l-red-500' : isWaitlist ? 'sm:border-l-yellow-500' : 'sm:border-l-green-500'
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start gap-2">
              <CardTitle className="text-xl md:text-2xl flex-1">{event.title}</CardTitle>
              {!isPast &&
                (isEventCancelled ? (
                  <Badge variant="destructive">Cancelled</Badge>
                ) : isWaitlist ? (
                  <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                    ⏳ #{booking.waitlist_position}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-600">✓ Confirmed</Badge>
                ))}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{event.description}</p>

            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span>📅</span>
                <span>{formatDateTime(event.date)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>📍</span>
                <span>{formatVenueName(event.location)}</span>
              </div>
              {event.theme && (
                <div className="flex items-center gap-2">
                  <span>🎨</span>
                  <span>{event.theme}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span>🗣️</span>
                <span>{formatEventLanguages(event)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span>🔞</span>
                <span>{getRatingDisplay(event.rating)}</span>
              </div>
              {event.max_attendees != null && spotsLeft != null && (
                <div className="flex items-center gap-2">
                  <span>👥</span>
                  <span>{spotsLeft} / {event.max_attendees} spots left</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <div className="flex items-center gap-1 text-muted-foreground">
                <span>💳</span>
                {isBookedShow ? (
                  <span>Invite only</span>
                ) : isAudienceBooking ? (
                  booking.credits_used > 0 ? (
                    <span>Deposit held: {booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                  ) : (
                    <span>Free pass used</span>
                  )
                ) : (
                  <span>{booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                )}
              </div>
              {!isPast ? (
                <Badge variant="secondary">⏰ In {timeDisplay}</Badge>
              ) : (
                <Badge variant="outline">✓ Completed</Badge>
              )}
            </div>

            {isAudienceBooking && booking.audience_checkin_code && (
              <div className="text-sm rounded-md border bg-muted/30 px-3 py-2">
                Check-in code: <span className="font-medium">{booking.audience_checkin_code}</span>
              </div>
            )}

            {canCancel && (
              <div className="space-y-2 pt-4 border-t">
                <Button
                  onClick={handleCancel}
                  disabled={cancelling}
                  variant="destructive"
                  size="sm"
                  className="w-full"
                >
                  {cancelling ? 'Cancelling...' : isWaitlist ? 'Leave Waitlist' : 'Cancel Booking'}
                </Button>
                {!isBookedShow && (
                  <p className="text-xs text-muted-foreground text-center">
                    {isWaitlist
                      ? '✓ Full refund if you leave waitlist'
                      : willGetRefund
                        ? `✓ Full refund available (${refundTimeDisplay} left)`
                        : `⚠️ No refund (within ${cancellationWindow}h window)`}
                  </p>
                )}
              </div>
            )}

            <div className="pt-4">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/events/${event.id}`}>View Event Details</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
