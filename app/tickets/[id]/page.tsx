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

type TicketPurchaseWithEvent = {
  id: string
  status: string
  quantity: number
  unit_price_cents: number
  total_cents: number
  credits_applied_cents: number | null
  created_at: string
  events: {
    id: string
    title: string
    description: string
    date: string
    location: unknown
    event_type: string
    cancellation_hours: number
    status?: string | null
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

export default function TicketDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const purchaseId = params.id as string
  const { confirm } = useConfirmDialog()
  const { authResolved, user } = useAuthBootstrap()

  const [purchase, setPurchase] = useState<TicketPurchaseWithEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }
    void loadPurchase()
  }, [authResolved, user, purchaseId, router])

  async function loadPurchase() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('ticket_purchases')
        .select(`
          id,
          status,
          quantity,
          unit_price_cents,
          total_cents,
          credits_applied_cents,
          created_at,
          events (
            id,
            title,
            description,
            date,
            location,
            event_type,
            cancellation_hours,
            status
          )
        `)
        .eq('id', purchaseId)
        .eq('user_id', user!.id)
        .single()

      if (error || !data) {
        setPurchase(null)
        return
      }

      setPurchase(data as unknown as TicketPurchaseWithEvent)
    } catch (err) {
      console.error('Error loading ticket purchase:', err)
      setPurchase(null)
    } finally {
      setLoading(false)
    }
  }

  async function handleCancel() {
    if (!purchase?.id) {
      toast.error('Ticket details are still loading — please try again in a moment.')
      return
    }
    const refundCredits = Math.round(purchase.total_cents / 100)

    const shouldProceed = await confirm({
      title: 'Cancel your tickets?',
      message: `You'll cancel ${purchase.quantity} ticket${purchase.quantity === 1 ? '' : 's'} for "${purchase.events.title}" and receive ${refundCredits} credit${refundCredits === 1 ? '' : 's'} back to your account as app credits — even if you originally paid by card. This can't be undone.`,
      confirmText: 'Cancel & refund',
      cancelText: 'Keep my tickets',
      variant: 'destructive',
    })
    if (!shouldProceed) return

    setCancelling(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch(`/api/tickets/cancel?purchaseId=${encodeURIComponent(purchase.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ purchaseId: purchase.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to cancel tickets')

      const refundedCredits = Number(result.creditsRefunded || 0)
      toast.success(`Tickets cancelled. ${refundedCredits} credit${refundedCredits === 1 ? '' : 's'} have been added to your account.`)
      router.push('/profile')
    } catch (error: unknown) {
      toast.error('Error cancelling tickets: ' + (error instanceof Error ? error.message : 'Unknown error'))
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

  if (!purchase) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-2xl mx-auto px-4 py-8">
          <h1 className="text-2xl font-bold mb-4">Tickets not found</h1>
          <p className="text-muted-foreground mb-4">This ticket purchase may not exist or you don&apos;t have access to it.</p>
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

  const event = purchase.events
  const isEventCancelled = event.status === 'cancelled'
  const isRefunded = purchase.status === 'refunded'
  const eventDate = new Date(event.date)
  const now = new Date()
  const diffMs = eventDate.getTime() - now.getTime()
  const isPast = diffMs < 0
  const hoursUntilEvent = diffMs / (1000 * 60 * 60)
  const cancellationWindow = Number(event.cancellation_hours || 0)
  const canCancel = purchase.status === 'completed' && !isPast && !isEventCancelled
  const willGetRefund = isEventCancelled || hoursUntilEvent >= cancellationWindow

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

  const creditsApplied = Math.round((purchase.credits_applied_cents || 0) / 100)
  const chargedCents = Math.max(0, purchase.total_cents - (purchase.credits_applied_cents || 0))

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
          <h1 className="text-2xl font-bold">Ticket Details</h1>
        </div>

        <Card
          className={cn(
            'border-l-0 sm:border-l-4',
            isEventCancelled ? 'sm:border-l-red-500' : isRefunded ? 'sm:border-l-muted-foreground' : 'sm:border-l-green-500'
          )}
        >
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start gap-2">
              <CardTitle className="text-xl md:text-2xl flex-1">{event.title}</CardTitle>
              {!isPast &&
                (isEventCancelled ? (
                  <Badge variant="destructive">Cancelled</Badge>
                ) : isRefunded ? (
                  <Badge variant="outline">Refunded</Badge>
                ) : (
                  <Badge variant="outline" className="text-green-600 border-green-600">🎟️ Confirmed</Badge>
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
                <span>{formatLocationValue(event.location)}</span>
              </div>
            </div>

            <div className="space-y-1 text-sm pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tickets</span>
                <span>{purchase.quantity} × ${(purchase.unit_price_cents / 100).toFixed(2)} CAD</span>
              </div>
              {creditsApplied > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Ticket value</span>
                    <span>${(purchase.total_cents / 100).toFixed(2)} CAD</span>
                  </div>
                  <div className="flex items-center justify-between text-green-700 dark:text-green-400">
                    <span>Credits applied</span>
                    <span>-${(creditsApplied).toFixed(2)} ({creditsApplied} credit{creditsApplied === 1 ? '' : 's'})</span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span>Charged to card</span>
                    <span>${(chargedCents / 100).toFixed(2)} CAD</span>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between font-medium">
                  <span className="text-muted-foreground">Total paid</span>
                  <span>${(purchase.total_cents / 100).toFixed(2)} CAD</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <span className="text-muted-foreground">Status</span>
              {!isPast ? (
                <Badge variant="secondary">⏰ In {timeDisplay}</Badge>
              ) : (
                <Badge variant="outline">✓ Completed</Badge>
              )}
            </div>

            <div className="pt-4">
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link href={`/events/${event.id}`}>View Event Details</Link>
              </Button>
            </div>

            {/* Refund option — intentionally understated so it doesn't compete with the main actions. */}
            {canCancel && (
              <div className="pt-6 mt-2 border-t border-dashed border-muted text-center">
                {willGetRefund ? (
                  <>
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="text-xs text-muted-foreground/70 hover:text-muted-foreground underline underline-offset-2 disabled:opacity-50"
                    >
                      {cancelling ? 'Cancelling…' : 'Need to cancel? Get a credit refund'}
                    </button>
                    <p className="text-[11px] text-muted-foreground/50 mt-1">
                      Refunded as app credits · cancel up to {cancellationWindow}h before showtime
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground/50">
                    Past the {cancellationWindow}h cancellation window — tickets are no longer refundable
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
