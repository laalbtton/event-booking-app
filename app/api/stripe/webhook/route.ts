import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { sendEmail, getCreditPurchaseEmail, getTicketPurchaseEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!
const stripeMode = (process.env.NEXT_PUBLIC_STRIPE_MODE || 'test') as 'test' | 'live'

export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'Missing Stripe signature.' }, { status: 400 })
  }

  let event
  const payload = await request.text()

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (err: any) {
    console.error('Stripe webhook signature error:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ received: true })
  }

  const session = event.data.object as Stripe.Checkout.Session

  // ── Branch: event ticket purchase ────────────────────────────────────────────
  if (session?.metadata?.ticketType === 'event_ticket') {
    return handleTicketPurchase(session)
  }

  // ── Branch: credit purchase (existing flow) ──────────────────────────────────
  const userId = session?.metadata?.userId
  const creditsRaw = session?.metadata?.credits
  const credits = Number(creditsRaw || Math.round((session.amount_total || 0) / 100))

  if (!userId || !credits || credits <= 0) {
    return NextResponse.json({ error: 'Invalid session metadata.' }, { status: 400 })
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey)
  const paymentIntentId = session.payment_intent || null
  const sessionNote = `Stripe checkout ${session.id}`

  const { data: existingByNote } = await serviceClient
    .from('credit_transactions')
    .select('id')
    .eq('notes', sessionNote)
    .eq('transaction_type', 'purchase')
    .maybeSingle()

  if (existingByNote) {
    return NextResponse.json({ received: true })
  }

  if (paymentIntentId) {
    const { data: existingByPayment } = await serviceClient
      .from('credit_transactions')
      .select('id')
      .eq('stripe_payment_id', paymentIntentId)
      .maybeSingle()

    if (existingByPayment) {
      return NextResponse.json({ received: true })
    }
  }

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, email, full_name, credits, credits_purchased, credits_complimentary, stripe_customer_id, stripe_customer_mode')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    console.error('Profile not found for webhook:', profileError)
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  const transactionPayload = {
    user_id: userId,
    amount: credits,
    transaction_type: 'purchase',
    reference_id: null,
    notes: sessionNote,
    stripe_payment_id: paymentIntentId,
    credit_source: 'purchase',
    source_reason: 'stripe_checkout',
  }

  const { error: insertError } = await serviceClient
    .from('credit_transactions')
    .insert(transactionPayload)

  if (insertError) {
    // Fallback if stripe_payment_id column is missing in prod schema.
    console.error('Failed to log credit transaction:', insertError)
    const { error: fallbackError } = await serviceClient
      .from('credit_transactions')
      .insert({
        user_id: userId,
        amount: credits,
        transaction_type: 'purchase',
        reference_id: null,
        notes: sessionNote,
      })
    if (fallbackError) {
      console.error('Fallback credit transaction insert failed:', fallbackError)
      return NextResponse.json({ error: 'Failed to log credit transaction.' }, { status: 500 })
    }
  }

  const newBalance = (profile.credits || 0) + credits
  const newPurchased = (profile.credits_purchased ?? 0) + credits

  const { error: updateError } = await serviceClient
    .from('profiles')
    .update({
      credits: newBalance,
      credits_purchased: newPurchased,
      stripe_customer_id: profile.stripe_customer_id || session.customer || null,
      stripe_customer_mode: profile.stripe_customer_mode || stripeMode,
    })
    .eq('id', userId)

  if (updateError) {
    console.error('Failed to update credits:', updateError)
    return NextResponse.json({ error: 'Failed to update credits.' }, { status: 500 })
  }

  if (profile.email) {
    const emailHtml = getCreditPurchaseEmail({
      userName: profile.full_name || 'there',
      creditsAdded: credits,
      newBalance,
      amountPaid: session.amount_total ? session.amount_total / 100 : credits,
    })
    await sendEmail({
      to: profile.email,
      subject: 'Credits added to your account',
      html: emailHtml,
    })
  }

  return NextResponse.json({ received: true })
}

async function handleTicketPurchase(session: Stripe.Checkout.Session): Promise<NextResponse> {
  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { eventId, ticketId, quantity: qtyStr, unitPriceCents: unitStr } = session.metadata!
  const quantity = Number(qtyStr || 1)
  const unitPriceCents = Number(unitStr || 0)
  const totalCents = session.amount_total || unitPriceCents * quantity
  const stripeSessionId = session.id
  const paymentIntentId = session.payment_intent as string | null

  // Idempotency — skip if already processed
  const { data: existing } = await serviceClient
    .from('ticket_purchases')
    .select('id')
    .eq('stripe_session_id', stripeSessionId)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ received: true })
  }

  // Buyer details from Stripe
  const buyerEmail = session.customer_details?.email || null
  const buyerName = session.customer_details?.name || null

  // Look up user by email (optional link)
  let userId: string | null = null
  if (buyerEmail) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', buyerEmail)
      .maybeSingle()
    userId = profile?.id || null
  }

  // Insert ticket_purchases record
  await serviceClient.from('ticket_purchases').insert({
    event_id: eventId,
    stripe_session_id: stripeSessionId,
    stripe_payment_intent: paymentIntentId,
    user_id: userId,
    buyer_name: buyerName,
    buyer_email: buyerEmail,
    quantity,
    unit_price_cents: unitPriceCents,
    total_cents: totalCents,
    currency: session.currency || 'cad',
    status: 'completed',
  })

  // Increment sold count on event_tickets
  const { data: ticketRow } = await serviceClient
    .from('event_tickets')
    .select('sold')
    .eq('id', ticketId)
    .maybeSingle()

  if (ticketRow) {
    await serviceClient
      .from('event_tickets')
      .update({ sold: (ticketRow.sold as number) + quantity })
      .eq('id', ticketId)
  }

  // Send confirmation email
  if (buyerEmail) {
    const { data: eventRow } = await serviceClient
      .from('events')
      .select('id, title, date, venue_id, venues(name)')
      .eq('id', eventId)
      .maybeSingle()

    if (eventRow) {
      const venueName = (eventRow.venues as any)?.name as string | null
      const eventDate = eventRow.date ? formatDateTimeEastern(eventRow.date) : 'TBA'
      const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://laalbutton.com'
      const html = getTicketPurchaseEmail({
        buyerName: buyerName || 'there',
        eventTitle: eventRow.title as string,
        eventDate,
        venueName,
        quantity,
        unitPriceCents,
        totalCents,
        eventUrl: `${origin}/events/${eventId}`,
      })
      await sendEmail({
        to: buyerEmail,
        subject: `Your tickets for ${eventRow.title}`,
        html,
      })
    }
  }

  return NextResponse.json({ received: true })
}
