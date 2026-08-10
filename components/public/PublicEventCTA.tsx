'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getGuestTicketPromoMessage } from '@/lib/promotions'
import { GUEST_TICKET_CREDIT_PROMO_ENABLED } from '@/lib/featureFlags'

type Props = {
  eventSlug: string
  eventId: string
  eventType?: string | null
  isCancelled?: boolean
  isPast?: boolean
  ticketsEnabled?: boolean
  ticketPriceCents?: number | null
  ticketQuantity?: number | null
  ticketSold?: number | null
  ticketUrl?: string | null
  isFree?: boolean
  redeemableCredits?: number | null
}

export function PublicEventCTA({
  eventSlug,
  eventId,
  eventType,
  isCancelled,
  isPast,
  ticketsEnabled,
  ticketPriceCents,
  ticketQuantity,
  ticketSold,
  ticketUrl,
  isFree,
  redeemableCredits,
}: Props) {
  const { authResolved, user } = useAuthBootstrap()
  const [mounted, setMounted] = useState(false)

  // Attend form state (open mic magic link — free / non-ticketed attend path)
  const [showAttendForm, setShowAttendForm] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [attendError, setAttendError] = useState('')

  // Guest ticket checkout
  const [ticketQty, setTicketQty] = useState(1)
  const [ticketLoading, setTicketLoading] = useState(false)
  const [ticketError, setTicketError] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !authResolved) return null
  if (user) return null

  const returnTo = `/events/${eventSlug}`
  const performUrl = `/signup?role=performer&returnTo=${encodeURIComponent(returnTo)}`
  const signupUrl = `/signup?role=audience&returnTo=${encodeURIComponent(returnTo)}`

  if (isCancelled) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 text-center text-sm text-stone-400">
        This event has been cancelled.
      </div>
    )
  }

  if (isPast) {
    return (
      <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 text-center">
        <p className="text-sm text-stone-400">This event has already taken place.</p>
        <Button variant="outline" size="sm" className="mt-3 border-zinc-600 text-stone-300 hover:bg-zinc-800 hover:text-stone-100" asChild>
          <Link href="/events">Browse upcoming events</Link>
        </Button>
      </div>
    )
  }

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setAttendError('')

    const callbackUrl =
      `${window.location.origin}/auth/callback?intent=attend&eventId=${encodeURIComponent(eventId)}&eventSlug=${encodeURIComponent(eventSlug)}`

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
      },
    })

    if (error) {
      setAttendError(error.message)
    } else {
      setSent(true)
    }
    setSending(false)
  }

  async function handleBuyTickets() {
    setTicketLoading(true)
    setTicketError('')
    try {
      const response = await fetch('/api/stripe/ticket-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, quantity: ticketQty }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.url) {
        throw new Error(result.error || 'Unable to start checkout')
      }
      window.location.href = result.url as string
    } catch (err: unknown) {
      setTicketError(err instanceof Error ? err.message : 'Unable to start checkout')
      setTicketLoading(false)
    }
  }

  const isBookedShow = eventType === 'booked_show'
  const remaining =
    ticketQuantity != null && ticketSold != null
      ? Math.max(0, ticketQuantity - ticketSold)
      : null
  const soldOut = remaining === 0
  const hasPricedTickets =
    !!ticketsEnabled && !isFree && ticketPriceCents != null && ticketPriceCents > 0
  // Same guest Stripe checkout for booked shows and ticketed open mics
  const canCheckoutTickets = !!ticketsEnabled && !ticketUrl && hasPricedTickets
  const hasExternalTickets = !!ticketsEnabled && !!ticketUrl
  const promo = getGuestTicketPromoMessage(ticketPriceCents)

  const signupNudge = GUEST_TICKET_CREDIT_PROMO_ENABLED ? (
    <div className="rounded-lg border-2 border-yellow-400/40 bg-zinc-800 p-4 space-y-2.5">
      <p className="text-sm font-semibold text-yellow-300">{promo.headline}</p>
      <p className="text-xs text-stone-300 leading-relaxed">{promo.detail}</p>
      {redeemableCredits != null && redeemableCredits > 0 && (
        <p className="text-xs text-stone-300">
          This show also supports redeemable credits (up to {redeemableCredits} Cr) for app members.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button asChild size="sm" className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
          <Link href={signupUrl}>Create free account</Link>
        </Button>
        <Button asChild size="sm" variant="ghost" className="text-stone-300 hover:text-yellow-300 hover:bg-zinc-700">
          <Link href="/promotions">View promotions</Link>
        </Button>
      </div>
    </div>
  ) : null

  const guestTicketBlock = canCheckoutTickets ? (
    <div className="rounded-lg border-2 border-yellow-400 bg-yellow-400/10 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold text-stone-50">
          ${(ticketPriceCents! / 100).toFixed(2)}
          <span className="text-sm font-normal text-stone-400"> CAD / ticket</span>
        </span>
        {remaining != null && remaining <= 10 && remaining > 0 && (
          <span className="text-xs font-medium text-orange-400">Only {remaining} left</span>
        )}
      </div>

      {soldOut ? (
        <p className="text-sm font-semibold text-red-400">Sold out</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-stone-400" htmlFor="guest-ticket-qty">
            Qty
          </label>
          <select
            id="guest-ticket-qty"
            className="h-10 w-16 rounded-md border border-zinc-600 bg-zinc-800 px-2 text-sm text-stone-100"
            value={ticketQty}
            onChange={(e) => setTicketQty(Number(e.target.value))}
            disabled={ticketLoading}
          >
            {Array.from(
              { length: Math.min(10, remaining ?? 10) },
              (_, i) => i + 1,
            ).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <Button
            type="button"
            className="flex-1 min-w-[10rem] h-10 bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold text-base"
            onClick={handleBuyTickets}
            disabled={ticketLoading}
          >
            {ticketLoading
              ? 'Opening…'
              : `Get Tickets · $${(((ticketPriceCents || 0) * ticketQty) / 100).toFixed(2)}`}
          </Button>
        </div>
      )}
      {ticketError && <p className="text-xs text-destructive">{ticketError}</p>}
      <p className="text-xs text-stone-500">No account required · pay securely with Stripe</p>
    </div>
  ) : hasExternalTickets ? (
    <a
      href={ticketUrl!}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-lg border-2 border-yellow-400 bg-yellow-400/10 p-4 hover:bg-yellow-400/15 transition-colors"
    >
      <div>
        <p className="font-semibold text-stone-100">Get tickets</p>
        <p className="text-xs text-stone-400">Continue on the external ticket page</p>
      </div>
      <span className="text-2xl shrink-0">🎟️</span>
    </a>
  ) : isBookedShow ? (
    <div className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4 text-center space-y-1">
      <p className="text-sm font-medium text-stone-200">Tickets aren&apos;t on sale yet</p>
      <p className="text-xs text-stone-400">Check back soon, or create a free account to get notified.</p>
    </div>
  ) : null

  return (
    <div className="rounded-xl border border-zinc-700 bg-zinc-900 shadow-sm p-5 space-y-4">
      {/* Guest ticket checkout — booked shows and ticketed open mics */}
      {guestTicketBlock}

      {/* Open mic: perform signup + free attend (when not buying tickets) */}
      {!isBookedShow && (
        <>
          <Link
            href={performUrl}
            className="flex items-center gap-3 rounded-lg border-2 border-yellow-400/60 bg-yellow-400/10 p-4 hover:bg-yellow-400/15 hover:border-yellow-400 transition-colors"
          >
            <span className="text-2xl shrink-0">🎤</span>
            <div>
              <p className="font-semibold text-sm text-stone-100">I want to perform</p>
              <p className="text-xs text-stone-400">Sign up and book a spot on stage</p>
            </div>
          </Link>

          {/* Magic-link attend only when tickets aren't the audience path */}
          {!canCheckoutTickets && !hasExternalTickets && (
            <div className="rounded-lg border-2 border-zinc-700 p-4 space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl shrink-0">🎟️</span>
                <div>
                  <p className="font-semibold text-sm text-stone-100">I want to attend</p>
                  <p className="text-xs text-stone-400">Register instantly — no password needed</p>
                </div>
              </div>

              {sent ? (
                <div className="rounded-lg bg-green-900/30 border border-green-700 p-3 text-center space-y-1">
                  <p className="text-sm font-medium text-green-300">📬 Check your email</p>
                  <p className="text-xs text-green-400">
                    We sent a link to <span className="font-medium">{email}</span>. Click it to register — no password required.
                  </p>
                </div>
              ) : showAttendForm ? (
                <form onSubmit={handleSendMagicLink} className="space-y-2">
                  <Input
                    type="email"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="text-sm bg-zinc-800 border-zinc-600 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
                  />
                  {attendError && (
                    <p className="text-xs text-destructive">{attendError}</p>
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" className="flex-1 bg-yellow-400 text-zinc-950 hover:bg-yellow-300" disabled={sending}>
                      {sending ? 'Sending…' : 'Send magic link'}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-stone-400 hover:text-stone-200 hover:bg-zinc-800"
                      onClick={() => { setShowAttendForm(false); setAttendError('') }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-zinc-800 border-zinc-600 text-stone-100 hover:bg-zinc-700 hover:border-zinc-500 hover:text-white"
                  onClick={() => setShowAttendForm(true)}
                >
                  Register to attend
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {signupNudge}

      <p className="text-center text-xs text-stone-500">
        Already have an account?{' '}
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="text-yellow-400 underline hover:text-yellow-300"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}
