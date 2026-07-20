'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Coffee } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { PublicHeader } from '@/components/public/PublicHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import {
  CHAI_PROMO_CREDITS,
  CHAI_PROMO_DESCRIPTION,
  CHAI_PROMO_TITLE,
  CHAI_PROMO_VALIDITY_DAYS,
} from '@/lib/chaiPromo'
import { canSeePromotion, ACTIVE_PROMOTIONS } from '@/lib/promotions'

const RETURN_TO = '/promotions/ryans-chai'

export default function RyansChaiPromotionPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState(false)

  const promo = ACTIVE_PROMOTIONS.find((p) => p.id === 'ryans-chai-1-dollar')

  useEffect(() => {
    if (!authResolved) return

    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        if (error) throw error
        if (cancelled) return
        setProfile(data)
        if (promo && !canSeePromotion(promo, data.role)) {
          router.replace('/promotions')
        }
      } catch (error: unknown) {
        toast.error((error as { message?: string })?.message || 'Failed to load promotion')
        router.replace('/promotions')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, user, router, promo])

  async function handlePurchase() {
    if (!profile) return
    if (Number(profile.credits || 0) < CHAI_PROMO_CREDITS) {
      toast.error(`You need ${CHAI_PROMO_CREDITS} credits. Buy more credits or earn them via other promotions.`)
      return
    }

    setPurchasing(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Please sign in again')

      const response = await fetch('/api/promotions/chai/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to buy coupon')

      toast.success('Coupon purchased! Find it in your Coupons tab.')
      window.dispatchEvent(new Event('coupons-unread-changed'))
      router.push('/profile?tab=coupons')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not buy coupon')
    } finally {
      setPurchasing(false)
    }
  }

  if (!authResolved || loading) {
    return <SettingsSkeleton />
  }

  if (user && profile && promo && !canSeePromotion(promo, profile.role)) {
    return null
  }

  const credits = Number(profile?.credits || 0)
  const canAfford = credits >= CHAI_PROMO_CREDITS
  const loginHref = `/login?returnTo=${encodeURIComponent(RETURN_TO)}`
  const signupHref = `/signup?returnTo=${encodeURIComponent(RETURN_TO)}`

  return (
    <div className="min-h-screen bg-background pb-20">
      {!user && <PublicHeader />}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/promotions"
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to promotions"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">{CHAI_PROMO_TITLE}</h1>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-amber-100 dark:bg-amber-950/40 p-3 text-amber-800 dark:text-amber-300">
                <Coffee className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-xl">Buy a $1 chai coupon</CardTitle>
                <p className="text-sm text-muted-foreground">{CHAI_PROMO_DESCRIPTION}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
              <li>
                Costs <strong className="text-foreground">{CHAI_PROMO_CREDITS} credits</strong> from your
                balance
              </li>
              <li>
                Show the QR code at Ryan&apos;s Chai to get a chai for{' '}
                <strong className="text-foreground">$1</strong>
              </li>
              <li>Single use — staff scan marks it redeemed</li>
              <li>Valid for {CHAI_PROMO_VALIDITY_DAYS} days after purchase</li>
            </ul>

            {!user ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Log in or create a free audience account to buy this coupon with your credits.
                </p>
                <Button asChild className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold" size="lg">
                  <Link href={signupHref}>Create free account</Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href={loginHref}>Log in to buy</Link>
                </Button>
              </>
            ) : (
              <>
                <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Your credits</span>
                  <span className="font-semibold text-foreground">{credits}</span>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePurchase}
                  disabled={purchasing || !canAfford || !profile}
                >
                  {purchasing
                    ? 'Buying…'
                    : canAfford
                      ? `Buy coupon · ${CHAI_PROMO_CREDITS} credits`
                      : `Need ${CHAI_PROMO_CREDITS - credits} more credit${CHAI_PROMO_CREDITS - credits === 1 ? '' : 's'}`}
                </Button>

                {!canAfford && (
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/buy-credits">Buy credits</Link>
                  </Button>
                )}

                <p className="text-xs text-muted-foreground text-center">
                  After purchase, open Home → Coupons to show your QR code to staff.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
