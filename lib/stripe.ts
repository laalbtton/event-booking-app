import Stripe from 'stripe'

let cachedStripe: Stripe | null = null

function getStripeClient(): Stripe {
  if (cachedStripe) return cachedStripe

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('STRIPE_SECRET_KEY is not set')
  }

  cachedStripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
  })

  return cachedStripe
}

/** Built on first use so `next build` can load routes without Stripe keys present. */
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, property) {
    const client = getStripeClient()
    const value = Reflect.get(client, property) as unknown
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})
