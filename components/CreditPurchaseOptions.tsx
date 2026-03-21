'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { getCreditPacks, MAX_CUSTOM_CREDITS, MIN_CUSTOM_CREDITS } from '@/lib/credits'

type CheckoutRequest =
  | { type: 'pack'; priceId: string }
  | { type: 'custom'; credits: number }

type CreditPurchaseOptionsProps = {
  onCheckout: (payload: CheckoutRequest) => void
  loading?: boolean
  showHeader?: boolean
}

export default function CreditPurchaseOptions({
  onCheckout,
  loading = false,
  showHeader = true,
}: CreditPurchaseOptionsProps) {
  const [customCredits, setCustomCredits] = useState<string>('10')

  const parsedCustomCredits = useMemo(() => {
    const value = Number(customCredits)
    if (!Number.isFinite(value)) return null
    return Math.floor(value)
  }, [customCredits])

  const customIsValid =
    parsedCustomCredits !== null &&
    parsedCustomCredits >= MIN_CUSTOM_CREDITS &&
    parsedCustomCredits <= MAX_CUSTOM_CREDITS

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="space-y-2">
          <h2 className="text-lg sm:text-xl font-semibold">Buy credits</h2>
          <p className="text-sm text-muted-foreground">
            1 credit = $1 CAD. Credits never expire.
          </p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {getCreditPacks().map((pack) => (
          <Card key={pack.id} className="border border-gray-200 shadow-sm">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{pack.label}</p>
                  <p className="text-2xl font-bold text-gray-900">${(pack.amountCents / 100).toFixed(0)}</p>
                </div>
                {pack.credits === 10 && (
                <Badge variant="secondary" className="bg-blue-50 text-blue-700">Popular</Badge>
                )}
              </div>
              <Button
                type="button"
                disabled={loading}
              onClick={() => onCheckout({ type: 'pack', priceId: pack.priceId })}
              >
                Buy {pack.credits} credits
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border border-gray-200 shadow-sm">
        <CardContent className="p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">Custom amount</p>
            <p className="text-xs text-muted-foreground">
              Min {MIN_CUSTOM_CREDITS} credits, max {MAX_CUSTOM_CREDITS} credits.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              type="number"
              min={MIN_CUSTOM_CREDITS}
              max={MAX_CUSTOM_CREDITS}
              value={customCredits}
              onChange={(event) => setCustomCredits(event.target.value)}
            />
            <Button
              type="button"
              disabled={loading || !customIsValid}
              onClick={() =>
                onCheckout({ type: 'custom', credits: parsedCustomCredits || MIN_CUSTOM_CREDITS })
              }
            >
              Buy {customIsValid ? parsedCustomCredits : ''} credits
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
