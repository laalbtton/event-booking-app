'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { ReferralInviteCard, canShowReferralInvite } from '@/components/ReferralInviteCard'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { toast } from 'sonner'

export default function InvitePromotionPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
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

  if (!authResolved || loading || !profile) {
    return <SettingsSkeleton />
  }

  if (!canShowReferralInvite(profile.role)) {
    return null
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
          <h1 className="text-2xl font-bold">Invite friends</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Share your QR code or invite link. When someone joins One Mic Stand through you, you earn 2
          Ryan&apos;s Chai venue credits.
        </p>
        <ReferralInviteCard userId={profile.id} />
      </div>
    </div>
  )
}
