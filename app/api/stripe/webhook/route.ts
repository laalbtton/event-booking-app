import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { sendEmail, getCreditPurchaseEmail, getTicketPurchaseEmail } from '@/lib/email'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import { buildEventUrl, getSiteUrl } from '@/lib/server/emailUrl'
import { splitDeduction } from '@/lib/creditLedger'

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

  const {
    eventId,
    ticketId,
    quantity: qtyStr,
    unitPriceCents: unitStr,
    totalCents: totalStr,
    creditsAppliedCents: creditsAppliedStr,
    userId: metadataUserId,
  } = session.metadata!
  const quantity = Number(qtyStr || 1)
  const unitPriceCents = Number(unitStr || 0)
  const creditsAppliedCents = Number(creditsAppliedStr || 0)
  // totalCents is the full ticket value; the Stripe charge only covers the remainder after credits.
  const totalCents = Number(totalStr || 0) || (session.amount_total || 0) + creditsAppliedCents || unitPriceCents * quantity
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

  // Prefer the authenticated user id passed at checkout creation time — reliable even
  // if the buyer's Stripe checkout email differs from their account email. Fall back
  // to an email match for true guest checkouts.
  let userId: string | null = metadataUserId || null
  if (!userId && buyerEmail) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id')
      .eq('email', buyerEmail)
      .maybeSingle()
    userId = profile?.id || null
  }

  // Insert ticket_purchases record
  const { data: insertedPurchase } = await serviceClient
    .from('ticket_purchases')
    .insert({
      event_id: eventId,
      stripe_session_id: stripeSessionId,
      stripe_payment_intent: paymentIntentId,
      user_id: userId,
      buyer_name: buyerName,
      buyer_email: buyerEmail,
      quantity,
      unit_price_cents: unitPriceCents,
      total_cents: totalCents,
      credits_applied_cents: creditsAppliedCents,
      currency: session.currency || 'cad',
      status: 'completed',
    })
    .select('id')
    .maybeSingle()

  // Debit the credits the buyer chose to apply toward this purchase. This only happens now
  // (payment confirmed) rather than at checkout creation, so abandoned Stripe sessions never
  // cost the buyer any credits.
  if (creditsAppliedCents > 0 && userId) {
    const creditsToApply = Math.round(creditsAppliedCents / 100)
    const { data: buyerProfile } = await serviceClient
      .from('profiles')
      .select('credits, credits_purchased, credits_complimentary')
      .eq('id', userId)
      .maybeSingle()

    if (buyerProfile) {
      const purchased = buyerProfile.credits_purchased ?? 0
      const complimentary = buyerProfile.credits_complimentary ?? 0
      const split = splitDeduction(purchased, complimentary, creditsToApply)

      await serviceClient
        .from('profiles')
        .update({
          credits: Math.max(0, Number(buyerProfile.credits || 0) - creditsToApply),
          credits_purchased: Math.max(0, purchased - split.purchasedUsed),
          credits_complimentary: Math.max(0, complimentary - split.complimentaryUsed),
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)

      await serviceClient.from('credit_transactions').insert({
        user_id: userId,
        amount: -creditsToApply,
        transaction_type: 'ticket_purchase',
        reference_id: insertedPurchase?.id || null,
        notes: `Tickets purchased with credits: event ${eventId}`,
      })
    } else {
      console.error('Could not find profile to debit ticket credits for user:', userId)
    }
  }

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
      const origin = getSiteUrl()
      const html = getTicketPurchaseEmail({
        buyerName: buyerName || 'there',
        creditsAppliedCents,
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
