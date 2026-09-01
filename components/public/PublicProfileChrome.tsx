'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { PublicHeader } from '@/components/public/PublicHeader'
import { ReferralInviteCard } from '@/components/ReferralInviteCard'
import { Button } from '@/components/ui/button'

type PublicProfileChromeProps = {
  performerId: string
  performerName: string
  children: React.ReactNode
}

/**
 * Logged-in users get app back navigation (PublicHeader hides itself when authed).
 * Logged-out visitors get marketing header + guest join actions on the invite QR.
 */
export function PublicProfileChrome({
  performerId,
  performerName,
  children,
}: PublicProfileChromeProps) {
  const router = useRouter()
  const { authResolved, user } = useAuthBootstrap()
  const isLoggedIn = Boolean(authResolved && user)

  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      {isLoggedIn ? (
        <div className="app-chrome-top sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5 text-stone-300 hover:bg-zinc-800 hover:text-yellow-400"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <span className="text-sm text-stone-500 truncate">Performer profile</span>
            <Link
              href="/dashboard"
              className="ml-auto text-xs font-medium text-yellow-400 hover:text-yellow-300"
            >
              Events
            </Link>
          </div>
        </div>
      ) : (
        <PublicHeader />
      )}

      {children}

      <div className="mx-auto max-w-3xl px-4 pb-10">
        <ReferralInviteCard
          userId={performerId}
          performerName={performerName}
          variant="dark"
          compact
          showGuestActions={authResolved && !user}
        />
      </div>
    </div>
  )
}
