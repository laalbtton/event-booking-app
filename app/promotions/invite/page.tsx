'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { ReferralInviteCard, canShowReferralInvite } from '@/components/ReferralInviteCard'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { PublicHeader } from '@/components/public/PublicHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { toast } from 'sonner'

const RETURN_TO = '/promotions/invite'

export default function InvitePromotionPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

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
        if (!canShowReferralInvite(data.role)) {
          router.replace('/promotions')
        }
      } catch (error: unknown) {
        toast.error((error as { message?: string })?.message || 'Failed to load invite promotion')
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

  if (user && profile && !canShowReferralInvite(profile.role)) {
    return null
  }

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
          <h1 className="text-2xl font-bold">Invite friends</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Share your QR code or invite link. When someone joins One Mic Stand through you, you earn 2
          Ryan&apos;s Chai venue credits.
        </p>

        {!user || !profile ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Your personal invite QR</CardTitle>
              <CardDescription>
                Sign in to get a unique QR code and link. Friends who join through you unlock your
                reward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                asChild
                className="w-full bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold"
              >
                <Link href={signupHref}>Create free account</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href={loginHref}>Log in to get your QR</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <ReferralInviteCard userId={profile.id} />
        )}
      </div>
    </div>
  )
}
