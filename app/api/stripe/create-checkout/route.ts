import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { getCreditPacks, MAX_CUSTOM_CREDITS, MIN_CUSTOM_CREDITS } from '@/lib/credits'
import type Stripe from 'stripe'

type CheckoutRequest =
  | { type: 'pack'; priceId: string }
  | { type: 'custom'; credits: number }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const stripeMode = (process.env.NEXT_PUBLIC_STRIPE_MODE || 'test') as 'test' | 'live'

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const serviceClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const payload = (await request.json()) as CheckoutRequest

    let credits = 0
    let lineItems:
      | { price: string; quantity: number }[]
      | { price_data: Stripe.Checkout.SessionCreateParams.LineItem.PriceData; quantity: number }[]

    if (payload.type === 'pack') {
      const pack = getCreditPacks().find((item) => item.priceId === payload.priceId)
      if (!pack) {
        return NextResponse.json({ error: 'Invalid credit pack.' }, { status: 400 })
      }

      credits = pack.credits
      lineItems = [{ price: pack.priceId, quantity: 1 }]
    } else {
      const requestedCredits = Math.floor(payload.credits)
      if (
        !Number.isFinite(requestedCredits) ||
        requestedCredits < MIN_CUSTOM_CREDITS ||
        requestedCredits > MAX_CUSTOM_CREDITS
      ) {
        return NextResponse.json({ error: 'Invalid credit amount.' }, { status: 400 })
      }

      credits = requestedCredits
      lineItems = [
        {
          price_data: {
            currency: 'cad',
            product_data: {
              name: `${credits} Credits`,
            },
            unit_amount: credits * 100,
          },
          quantity: 1,
        },
      ]
    }

    const { data: profile } = await serviceClient
      .from('profiles')
      .select('id, email, full_name, stripe_customer_id, stripe_customer_mode')
      .eq('id', authData.user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
    }

    let customerId = profile.stripe_customer_id
    const hasMatchingMode = profile.stripe_customer_mode === stripeMode
    if (customerId && !hasMatchingMode) {
      customerId = null
    }

    if (!customerId && profile.email) {
      const customer = await stripe.customers.create({
        email: profile.email,
        name: profile.full_name || undefined,
        metadata: {
          userId: profile.id,
        },
      })
      customerId = customer.id
      await serviceClient
        .from('profiles')
        .update({ stripe_customer_id: customerId, stripe_customer_mode: stripeMode })
        .eq('id', profile.id)
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000'

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: customerId || undefined,
      customer_email: customerId ? undefined : profile.email || undefined,
      line_items: lineItems,
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/dashboard?checkout=cancelled`,
      metadata: {
        userId: profile.id,
        credits: credits.toString(),
        purchaseType: payload.type,
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Unable to create checkout session.' }, { status: 500 })
    }

    return NextResponse.json({ url: session.url })
  } catch (error: any) {
    console.error('Stripe checkout error:', error)
    return NextResponse.json({ error: error.message || 'Checkout error' }, { status: 500 })
  }
}
