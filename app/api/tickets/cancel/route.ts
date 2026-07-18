import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, getTicketRefundEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { getSiteUrl } from '@/lib/server/emailUrl'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function getAdminClient() {
  if (!supabaseUrl || !supabaseServiceKey) return null
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Missing Supabase environment variables' }, { status: 500 })
    }

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })
    }

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Accept purchaseId from the JSON body (primary) or a query param (fallback) so a
    // missing/empty body — e.g. a dev-server hot-reload hiccup — doesn't hard-fail the request.
    let purchaseId: string | null = null
    try {
      const body = await request.json()
      purchaseId = body?.purchaseId || null
    } catch {
      purchaseId = null
    }
    if (!purchaseId) {
      const url = new URL(request.url)
      purchaseId = url.searchParams.get('purchaseId')
    }
    if (!purchaseId) {
      return NextResponse.json({ error: 'Missing purchaseId' }, { status: 400 })
    }

    const { data: purchase, error: purchaseError } = await supabase
      .from('ticket_purchases')
      .select('id, user_id, event_id, quantity, total_cents, status, buyer_name, buyer_email')
      .eq('id', purchaseId)
      .single()

    if (purchaseError || !purchase) {
      return NextResponse.json({ error: 'Ticket purchase not found' }, { status: 404 })
    }
    if (purchase.user_id !== authData.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (purchase.status !== 'completed') {
      return NextResponse.json({ error: 'These tickets are not eligible for cancellation' }, { status: 400 })
    }

    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, title, date, status, cancellation_hours, venue_id, venues(name)')
      .eq('id', purchase.event_id)
      .single()

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 })
    }

    const now = new Date()
    const eventDate = new Date(event.date)
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const cancellationWindow = Number(event.cancellation_hours || 0)
    const eventCancelled = event.status === 'cancelled'
    const refundEligible = eventCancelled || hoursUntilEvent >= cancellationWindow

    if (!refundEligible) {
      return NextResponse.json(
        { error: `Too close to showtime to cancel. Cancellations must be made at least ${cancellationWindow}h before the show.` },
        { status: 400 }
      )
    }

    // Always refund the full ticket value as app credits — regardless of whether the
    // buyer originally paid by card or applied existing credits at checkout.
    const creditsToRefund = Math.round((purchase.total_cents as number) / 100)

    const { error: cancelError } = await supabase
      .from('ticket_purchases')
      .update({ status: 'refunded', refunded_at: now.toISOString(), updated_at: now.toISOString() })
      .eq('id', purchase.id)
      .eq('status', 'completed')

    if (cancelError) {
      // Local/dev DB may not have `refunded_at` yet.
      if (cancelError.code === '42703' || cancelError.message?.includes('refunded_at')) {
        const fallback = await supabase
          .from('ticket_purchases')
          .update({ status: 'refunded', updated_at: now.toISOString() })
          .eq('id', purchase.id)
          .eq('status', 'completed')
        if (fallback.error) {
          return NextResponse.json({ error: fallback.error.message }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: cancelError.message }, { status: 500 })
      }
    }

    // Release the tickets back into inventory for other buyers.
    const { data: ticketRow } = await supabase
      .from('event_tickets')
      .select('id, sold')
      .eq('event_id', purchase.event_id)
      .maybeSingle()

    if (ticketRow) {
      await supabase
        .from('event_tickets')
        .update({ sold: Math.max(0, Number(ticketRow.sold || 0) - Number(purchase.quantity || 0)) })
        .eq('id', ticketRow.id as string)
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('credits, credits_purchased, email, full_name')
      .eq('id', authData.user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: profileError?.message || 'Profile not found' }, { status: 500 })
    }

    const newBalance = Number(profile.credits || 0) + creditsToRefund
    const { error: creditError } = await supabase
      .from('profiles')
      .update({
        credits: newBalance,
        credits_purchased: Number(profile.credits_purchased || 0) + creditsToRefund,
        updated_at: now.toISOString(),
      })
      .eq('id', authData.user.id)

    if (creditError) {
      return NextResponse.json({ error: creditError.message }, { status: 500 })
    }

    await supabase.from('credit_transactions').insert({
      user_id: authData.user.id,
      amount: creditsToRefund,
      transaction_type: 'ticket_refund',
      reference_id: purchase.id,
      notes: `Refund for cancelled tickets: ${event.title}`,
    })

    const recipientEmail = profile.email || purchase.buyer_email
    if (recipientEmail) {
      const venueName = (event.venues as any)?.name as string | null
      const eventDateFormatted = event.date ? formatDateTimeEastern(event.date as string) : 'TBA'
      const html = getTicketRefundEmail({
        buyerName: profile.full_name || purchase.buyer_name || 'there',
        eventTitle: event.title as string,
        eventDate: eventDateFormatted,
        venueName,
        quantity: Number(purchase.quantity || 0),
        totalCents: Number(purchase.total_cents || 0),
        creditsRefunded: creditsToRefund,
        newCreditBalance: newBalance,
        eventUrl: `${getSiteUrl()}/events/${purchase.event_id}`,
      })
      await sendEmail({
        to: recipientEmail,
        subject: `Your tickets for ${event.title} were cancelled`,
        html,
      })
    }

    return NextResponse.json({ success: true, creditsRefunded: creditsToRefund, newCreditBalance: newBalance })
  } catch (error: any) {
    console.error('Error cancelling ticket purchase:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
