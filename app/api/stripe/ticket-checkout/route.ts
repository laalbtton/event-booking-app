import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { splitDeduction } from '@/lib/creditLedger'
import { sendEmail, getTicketPurchaseEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { getSiteUrl } from '@/lib/server/emailUrl'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { eventId, quantity = 1, userId, email, useCredits } = body as {
      eventId: string
      quantity: number
      userId?: string | null
      email?: string | null
      useCredits?: boolean
    }

    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 })
    }

    const qty = Math.max(1, Math.min(10, Math.floor(Number(quantity))))
    if (!Number.isFinite(qty)) {
      return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
    }

    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    // Load event
    const { data: event, error: eventError } = await serviceClient
      .from('events')
      .select('id, title, date, status, event_type, tickets_enabled, venue_id, venues(name)')
      .eq('id', eventId)
      .maybeSingle()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }
    if (event.status === 'cancelled') {
      return NextResponse.json({ error: 'This event has been cancelled' }, { status: 400 })
    }
    // Booked shows and open mics can both sell tickets when tickets_enabled is on
    if (!event.tickets_enabled) {
      return NextResponse.json({ error: 'Tickets are not enabled for this event' }, { status: 400 })
    }
    if (event.event_type !== 'booked_show' && event.event_type !== 'open_mic') {
      return NextResponse.json({ error: 'Ticket checkout is not available for this event type' }, { status: 400 })
    }

    // Load ticket tier
    const { data: ticket, error: ticketError } = await serviceClient
      .from('event_tickets')
      .select('id, name, price_cents, quantity, sold')
      .eq('event_id', eventId)
      .maybeSingle()

    if (ticketError || !ticket) {
      return NextResponse.json({ error: 'Ticket information not found for this event' }, { status: 404 })
    }

    const available = (ticket.quantity as number) - (ticket.sold as number)
    if (available <= 0) {
      return NextResponse.json({ error: 'Tickets are sold out' }, { status: 400 })
    }
    if (qty > available) {
      return NextResponse.json({ error: `Only ${available} ticket${available !== 1 ? 's' : ''} remaining` }, { status: 400 })
    }

    const origin = request.headers.get('origin') || 'https://localhost:3000'
    const venueName = (event.venues as any)?.name as string | null
    const unitPriceCents = ticket.price_cents as number
    const totalCents = unitPriceCents * qty

    // Resolve a trustworthy email for a logged-in buyer so the webhook can
    // prefill Stripe checkout and link the purchase without guessing by email match.
    let prefillEmail = email || null
    let buyerProfile: { email: string | null; full_name: string | null; credits: number; credits_purchased: number | null; credits_complimentary: number | null } | null = null
    if (userId) {
      const { data } = await serviceClient
        .from('profiles')
        .select('email, full_name, credits, credits_purchased, credits_complimentary')
        .eq('id', userId)
        .maybeSingle()
      buyerProfile = data as any
      prefillEmail = buyerProfile?.email || prefillEmail
    }

    // ── Apply app credits toward the ticket price ($1 = 1 credit) ──────────────
    // Only whole credits are applied so we never need to debit a fractional credit.
    let creditsToApply = 0
    if (useCredits && userId && buyerProfile) {
      const availableCredits = Math.max(0, Number(buyerProfile.credits || 0))
      const ledgerBalance = Math.max(0, Number(buyerProfile.credits_purchased || 0)) + Math.max(0, Number(buyerProfile.credits_complimentary || 0))
      const maxApplicableCredits = Math.floor(totalCents / 100)
      creditsToApply = Math.min(availableCredits, ledgerBalance, maxApplicableCredits)

      // Stripe rejects charges below ~$0.50; if applying credits would leave a tiny
      // leftover balance, back off one credit so the remainder is either $0 or comfortably
      // above the minimum chargeable amount.
      const wouldRemainCents = totalCents - creditsToApply * 100
      if (wouldRemainCents > 0 && wouldRemainCents < 50 && creditsToApply > 0) {
        creditsToApply -= 1
      }
    }
    const creditsAppliedCents = creditsToApply * 100
    const remainingCents = totalCents - creditsAppliedCents

    if (creditsToApply > 0 && remainingCents <= 0) {
      // Fully covered by credits — no Stripe checkout needed at all.
      const purchased = buyerProfile!.credits_purchased ?? 0
      const complimentary = buyerProfile!.credits_complimentary ?? 0
      const split = splitDeduction(purchased, complimentary, creditsToApply)

      const { error: creditUpdateError } = await serviceClient
        .from('profiles')
        .update({
          credits: Math.max(0, Number(buyerProfile!.credits || 0) - creditsToApply),
          credits_purchased: Math.max(0, purchased - split.purchasedUsed),
          credits_complimentary: Math.max(0, complimentary - split.complimentaryUsed),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      if (creditUpdateError) {
        console.error('Failed to deduct credits for ticket purchase:', creditUpdateError)
        return NextResponse.json({ error: 'Failed to apply credits' }, { status: 500 })
      }

      const { data: purchase, error: purchaseError } = await serviceClient
        .from('ticket_purchases')
        .insert({
          event_id: eventId,
          stripe_session_id: null,
          stripe_payment_intent: null,
          user_id: userId,
          buyer_name: buyerProfile!.full_name || null,
          buyer_email: buyerProfile!.email || prefillEmail,
          quantity: qty,
          unit_price_cents: unitPriceCents,
          total_cents: totalCents,
          credits_applied_cents: creditsAppliedCents,
          currency: 'cad',
          status: 'completed',
        })
        .select('id')
        .maybeSingle()

      if (purchaseError) {
        // Roll back the credit deduction so the buyer isn't charged credits for nothing.
        await serviceClient
          .from('profiles')
          .update({
            credits: buyerProfile!.credits,
            credits_purchased: purchased,
            credits_complimentary: complimentary,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
        console.error('Failed to record credit-funded ticket purchase:', purchaseError)
        return NextResponse.json({ error: 'Failed to record ticket purchase' }, { status: 500 })
      }

      await serviceClient
        .from('event_tickets')
        .update({ sold: (ticket.sold as number) + qty })
        .eq('id', ticket.id as string)

      await serviceClient.from('credit_transactions').insert({
        user_id: userId,
        amount: -creditsToApply,
        transaction_type: 'ticket_purchase',
        reference_id: purchase?.id || null,
        notes: `Tickets purchased with credits: ${event.title}`,
      })

      const buyerEmailForConfirmation = buyerProfile!.email || prefillEmail
      if (buyerEmailForConfirmation) {
        const eventDate = event.date ? formatDateTimeEastern(event.date as string) : 'TBA'
        const html = getTicketPurchaseEmail({
          buyerName: buyerProfile!.full_name || 'there',
          eventTitle: event.title as string,
          eventDate,
          venueName,
          quantity: qty,
          unitPriceCents,
          totalCents,
          creditsAppliedCents,
          eventUrl: `${getSiteUrl()}/events/${eventId}`,
        })
        await sendEmail({
          to: buyerEmailForConfirmation,
          subject: `Your tickets for ${event.title}`,
          html,
        })
      }

      return NextResponse.json({ completedWithCredits: true, creditsApplied: creditsToApply })
    }

    // ── Partial (or no) credits applied — charge the remainder via Stripe ──────
    const chargeCents = creditsToApply > 0 ? remainingCents : totalCents
    const lineItemName = creditsToApply > 0
      ? `${ticket.name} — ${event.title} (after $${(creditsAppliedCents / 100).toFixed(2)} credit applied)`
      : `${ticket.name} — ${event.title}`

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: lineItemName,
              description: [
                venueName ? `Venue: ${venueName}` : null,
                // Always format in Eastern — Stripe runs on UTC servers, and
                // toLocaleDateString without a timezone shifts evening shows to the next calendar day.
                event.date ? `Date: ${formatDateTimeEastern(event.date as string)}` : null,
              ].filter(Boolean).join(' · ') || undefined,
            },
            unit_amount: chargeCents,
          },
          quantity: 1,
        },
      ],
      // Stripe collects email during guest checkout automatically; prefill when known.
      customer_creation: 'always',
      customer_email: prefillEmail || undefined,
      success_url: `${origin}/events/${eventId}?ticket_checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/events/${eventId}?ticket_checkout=cancelled`,
      metadata: {
        ticketType: 'event_ticket',
        eventId,
        ticketId: ticket.id as string,
        quantity: qty.toString(),
        unitPriceCents: unitPriceCents.toString(),
        totalCents: totalCents.toString(),
        creditsAppliedCents: creditsAppliedCents.toString(),
        userId: userId || '',
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Unable to create checkout session' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url, creditsApplied: creditsToApply })
  } catch (error: any) {
    console.error('Ticket checkout error:', error)
    return NextResponse.json({ error: error.message || 'Checkout error' }, { status: 500 })
  }
}
