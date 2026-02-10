import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import type Stripe from 'stripe'
import { sendEmail, getCreditPurchaseEmail } from '@/lib/email'

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
    .select('id, email, full_name, credits, stripe_customer_id, stripe_customer_mode')
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

  const { error: updateError } = await serviceClient
    .from('profiles')
    .update({
      credits: newBalance,
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
