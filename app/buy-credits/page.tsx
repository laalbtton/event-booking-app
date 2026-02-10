'use client'

import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import CreditPurchaseOptions from '@/components/CreditPurchaseOptions'
import { createCheckoutSession } from '@/lib/stripe-client'
import { useState } from 'react'

export default function BuyCreditsPage() {
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  async function handleCheckout(payload: { type: 'pack'; priceId: string } | { type: 'custom'; credits: number }) {
    try {
      setCheckoutLoading(true)
      setCheckoutError(null)
      const { url } = await createCheckoutSession(payload)
      window.location.href = url
    } catch (err: any) {
      setCheckoutError(err.message || 'Unable to start checkout.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4 pb-20">
      <div className="max-w-4xl mx-auto">
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Buy Credits</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <CreditPurchaseOptions onCheckout={handleCheckout} loading={checkoutLoading} />
            {checkoutError && (
              <p className="text-sm text-red-600">{checkoutError}</p>
            )}
          </CardContent>
        </Card>
      </div>
      <NavigationTabs />
    </div>
  )
}