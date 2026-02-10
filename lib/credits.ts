export type CreditPack = {
  id: string
  label: string
  credits: number
  amountCents: number
  priceId: string
}

type StripeMode = 'test' | 'live'

const STRIPE_MODE = (process.env.NEXT_PUBLIC_STRIPE_MODE || 'test') as StripeMode

const TEST_PACKS: CreditPack[] = [
  {
    id: 'credits-5',
    label: '5 credits',
    credits: 5,
    amountCents: 500,
    priceId: 'price_1Sz7J5Ah62Qt3gHu8JklD7A4',
  },
  {
    id: 'credits-10',
    label: '10 credits',
    credits: 10,
    amountCents: 1000,
    priceId: 'price_1Sz7J5Ah62Qt3gHuKv6ocveL',
  },
  {
    id: 'credits-50',
    label: '50 credits',
    credits: 50,
    amountCents: 5000,
    priceId: 'price_1Sz7J5Ah62Qt3gHugBObSqGa',
  },
]

const LIVE_PACKS: CreditPack[] = [
  {
    id: 'credits-5',
    label: '5 credits',
    credits: 5,
    amountCents: 500,
    priceId: 'price_1SyxsVAh62Qt3gHuY323mure',
  },
  {
    id: 'credits-10',
    label: '10 credits',
    credits: 10,
    amountCents: 1000,
    priceId: 'price_1Syxt6Ah62Qt3gHucqdBqFVf',
  },
  {
    id: 'credits-50',
    label: '50 credits',
    credits: 50,
    amountCents: 5000,
    priceId: 'price_1SyxtUAh62Qt3gHu4o0QGjyT',
  },
]

export function getCreditPacks(): CreditPack[] {
  return STRIPE_MODE === 'live' ? LIVE_PACKS : TEST_PACKS
}

export const MIN_CUSTOM_CREDITS = 5
export const MAX_CUSTOM_CREDITS = 500
