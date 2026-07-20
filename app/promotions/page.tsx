'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Gift } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsListRow } from '@/components/SettingsListRow'
import { Card, CardContent } from '@/components/ui/card'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { PublicHeader } from '@/components/public/PublicHeader'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'
import { getVisiblePromotions } from '@/lib/promotions'

export default function PromotionsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const [role, setRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authResolved) return

    // Guests can browse the promotions catalog — no login wall.
    if (!user) {
      setRole(null)
      setLoading(false)
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
  }, [authResolved, user])

  if (!authResolved || loading) {
    return <SettingsSkeleton />
  }

  // Guests see audience-facing promos; logged-in users see role-filtered list.
  const promotions = getVisiblePromotions(user ? role : null, { guest: !user })
  const backHref = user ? '/dashboard' : '/'

  return (
    <div className="min-h-screen bg-background pb-20">
      {!user && <PublicHeader />}
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link
            href={backHref}
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label={user ? 'Back to events' : 'Back to home'}
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
          {!user && " Create a free account when you're ready to claim one."}
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

        {!user && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-center">
            <p className="text-sm text-muted-foreground">
              Ready to claim a promotion? Sign up free — it only takes a minute.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-semibold">
                <Link href={`/signup?returnTo=${encodeURIComponent('/promotions')}`}>
                  Create free account
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/login?returnTo=${encodeURIComponent('/promotions')}`}>Log in</Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
