'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Button } from '@/components/ui/button'

type Props = {
  eventSlug: string
  isCancelled?: boolean
  isPast?: boolean
}

export function PublicEventCTA({ eventSlug, isCancelled, isPast }: Props) {
  const { authResolved, user } = useAuthBootstrap()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // While resolving auth, show nothing to avoid flicker — the existing page.tsx
  // client component handles the logged-in booking buttons.
  if (!mounted || !authResolved) return null

  // Logged-in users: page.tsx handles the CTA
  if (user) return null

  const returnTo = `/events/${eventSlug}`
  const performUrl = `/signup?role=performer&returnTo=${encodeURIComponent(returnTo)}`
  const attendUrl = `/signup?role=audience&returnTo=${encodeURIComponent(returnTo)}`

  if (isCancelled) {
    return (
      <div className="rounded-xl border bg-muted/50 p-5 text-center text-sm text-muted-foreground">
        This event has been cancelled.
      </div>
    )
  }

  if (isPast) {
    return (
      <div className="rounded-xl border bg-muted/50 p-5 text-center">
        <p className="text-sm text-muted-foreground">This event has already taken place.</p>
        <Button variant="outline" size="sm" className="mt-3" asChild>
          <Link href="/events">Browse upcoming events</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-3">
      <p className="text-sm font-medium text-center text-muted-foreground">
        Create a free account to join this event
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href={performUrl}
          className="flex flex-col items-center gap-1 rounded-lg border-2 border-primary bg-primary/5 p-4 hover:bg-primary/10 transition-colors text-center"
        >
          <span className="text-2xl">🎤</span>
          <span className="font-semibold text-sm">I want to perform</span>
          <span className="text-xs text-muted-foreground">Sign up and book a spot</span>
        </Link>
        <Link
          href={attendUrl}
          className="flex flex-col items-center gap-1 rounded-lg border-2 border-border p-4 hover:bg-accent transition-colors text-center"
        >
          <span className="text-2xl">🎟️</span>
          <span className="font-semibold text-sm">I want to attend</span>
          <span className="text-xs text-muted-foreground">Sign up and register to attend</span>
        </Link>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`} className="underline hover:text-foreground">
          Log in
        </Link>
      </p>
    </div>
  )
}
