'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Gift } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsListRow } from '@/components/SettingsListRow'
import { Card, CardContent } from '@/components/ui/card'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { supabase } from '@/lib/supabase'
import { getVisiblePromotions } from '@/lib/promotions'

export default function PromotionsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [role, setRole] = useState<string | null>(null)
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
        const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        if (!cancelled) setRole(data?.role ?? null)
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

  const promotions = getVisiblePromotions(role)

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to events"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2 min-w-0">
            <Gift className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0" />
            <h1 className="text-2xl font-bold truncate">Promotions</h1>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Active ways to earn credits and unlock perks.
        </p>

        <Card className="shadow-sm overflow-hidden">
          <CardContent className="p-0 divide-y divide-border">
            {promotions.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                No active promotions right now. Check back soon.
              </div>
            ) : (
              promotions.map((promo) => (
                <div key={promo.id} className="px-4 py-1 first:pt-2 last:pb-2">
                  <SettingsListRow
                    href={promo.href}
                    icon={promo.icon}
                    title={promo.title}
                    description={promo.description}
                  />
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
