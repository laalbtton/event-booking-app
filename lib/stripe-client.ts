import { supabase } from '@/lib/supabase'

type CheckoutRequest =
  | { type: 'pack'; priceId: string }
  | { type: 'custom'; credits: number }

type CheckoutResponse = {
  url: string
}

export async function createCheckoutSession(payload: CheckoutRequest): Promise<CheckoutResponse> {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token

  if (!token) {
    throw new Error('You must be logged in to purchase credits.')
  }

  const response = await fetch('/api/stripe/create-checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Checkout failed.' }))
    throw new Error(error.error || 'Checkout failed.')
  }

  return response.json()
}
