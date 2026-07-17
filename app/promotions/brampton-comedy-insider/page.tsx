'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Star } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import {
  CREDIT_ACCOUNT,
  CREDIT_EMAIL_UPDATES,
  CREDIT_PREFERENCES,
  CREDIT_TOTAL_AVAILABLE,
  FOUNDING_MEMBER_LIMIT,
} from '@/lib/foundingMembers'
import { toast } from 'sonner'

export default function BramptonComedyInsiderPromotionPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (error) throw error
        if (cancelled) return
        if (data?.role !== 'audience') {
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
  }, [authResolved, user, router])

  if (!authResolved || loading) {
    return <SettingsSkeleton />
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/promotions"
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to promotions"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <h1 className="text-2xl font-bold truncate">Brampton Comedy Insider</h1>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Audience promotion</CardTitle>
            <CardDescription>
              Help build Brampton&apos;s comedy community. Complete the survey and earn redeemable
              credits toward future shows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ul className="space-y-2 list-disc pl-5 text-foreground">
              <li>Create your account: +{CREDIT_ACCOUNT} credits</li>
              <li>Complete preferences survey: +{CREDIT_PREFERENCES} credits</li>
              <li>Opt in to email updates: +{CREDIT_EMAIL_UPDATES} credits</li>
              <li>
                Up to ${CREDIT_TOTAL_AVAILABLE} total for founding members (first {FOUNDING_MEMBER_LIMIT})
              </li>
            </ul>
            <p>
              This promotion is for audience members. You&apos;ll get priority access to Brampton
              comedy shows and exclusive invites as the community grows.
            </p>
            <Button asChild className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
              <Link href="/brampton-comedy-insider">Open survey &amp; join</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
