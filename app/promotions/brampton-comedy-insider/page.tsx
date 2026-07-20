'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Star } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { PublicHeader } from '@/components/public/PublicHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import {
  CREDIT_EMAIL_UPDATES,
  CREDIT_PREFERENCES,
  CREDIT_SURVEY_TOTAL,
  FOUNDING_MEMBER_LIMIT,
} from '@/lib/foundingMembers'
import { toast } from 'sonner'

const RETURN_TO = '/promotions/brampton-comedy-insider'

export default function BramptonComedyInsiderPromotionPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    if (!authResolved) return

    if (!user) {
      setRole(null)
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (error) throw error
        if (cancelled) return
        setRole(data?.role ?? null)
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

  if (user && role !== null && role !== 'audience') {
    return null
  }

  const loginHref = `/login?returnTo=${encodeURIComponent(RETURN_TO)}`
  const signupHref = `/signup?returnTo=${encodeURIComponent(RETURN_TO)}&role=audience`

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
          <div className="flex items-center gap-2 min-w-0">
            <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <h1 className="text-2xl font-bold truncate">Brampton Comedy Insider</h1>
          </div>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Audience promotion</CardTitle>
            <CardDescription>
              Help build Brampton&apos;s comedy community. Complete the preferences survey and earn
              redeemable credits toward future shows.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <ul className="space-y-2 list-disc pl-5 text-foreground">
              <li>Complete preferences survey: +{CREDIT_PREFERENCES} credits</li>
              <li>Opt in to email updates: +{CREDIT_EMAIL_UPDATES} credits</li>
              <li>
                Up to ${CREDIT_SURVEY_TOTAL} in survey credits (first {FOUNDING_MEMBER_LIMIT} founding
                members)
              </li>
            </ul>

            {!user ? (
              <>
                <p>
                  Create a free audience account to take the survey and claim your credits. Takes about
                  a minute.
                </p>
                <Button
                  asChild
                  className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold"
                >
                  <Link href={signupHref}>Create free account</Link>
                </Button>
                <Button asChild variant="outline" className="w-full sm:w-auto">
                  <Link href={loginHref}>Already have an account? Log in</Link>
                </Button>
              </>
            ) : (
              <>
                <p>
                  Because you already have an app account, we skip signup and use your existing name and
                  email. No magic link required.
                </p>
                <Button asChild className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
                  <Link href="/brampton-comedy-insider">Open survey</Link>
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
