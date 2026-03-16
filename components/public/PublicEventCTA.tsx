'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Props = {
  eventSlug: string
  eventId: string
  isCancelled?: boolean
  isPast?: boolean
}

export function PublicEventCTA({ eventSlug, eventId, isCancelled, isPast }: Props) {
  const { authResolved, user } = useAuthBootstrap()
  const [mounted, setMounted] = useState(false)

  // Attend form state
  const [showAttendForm, setShowAttendForm] = useState(false)
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [attendError, setAttendError] = useState('')

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !authResolved) return null
  if (user) return null

  const returnTo = `/events/${eventSlug}`
  const performUrl = `/signup?role=performer&returnTo=${encodeURIComponent(returnTo)}`

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

  async function handleSendMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setAttendError('')

    const callbackUrl =
      `${window.location.origin}/auth/callback?intent=attend&eventId=${encodeURIComponent(eventId)}&eventSlug=${encodeURIComponent(eventSlug)}`

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: callbackUrl,
      },
    })

    if (error) {
      setAttendError(error.message)
    } else {
      setSent(true)
    }
    setSending(false)
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm p-5 space-y-4">
      {/* Performer CTA */}
      <Link
        href={performUrl}
        className="flex items-center gap-3 rounded-lg border-2 border-primary bg-primary/5 p-4 hover:bg-primary/10 transition-colors"
      >
        <span className="text-2xl shrink-0">🎤</span>
        <div>
          <p className="font-semibold text-sm">I want to perform</p>
          <p className="text-xs text-muted-foreground">Sign up and book a spot on stage</p>
        </div>
      </Link>

      {/* Attend CTA — magic link form */}
      <div className="rounded-lg border-2 border-border p-4 space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0">🎟️</span>
          <div>
            <p className="font-semibold text-sm">I want to attend</p>
            <p className="text-xs text-muted-foreground">Register instantly — no password needed</p>
          </div>
        </div>

        {sent ? (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-center space-y-1">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">📬 Check your email</p>
            <p className="text-xs text-green-700 dark:text-green-400">
              We sent a link to <span className="font-medium">{email}</span>. Click it to register — no password required.
            </p>
          </div>
        ) : showAttendForm ? (
          <form onSubmit={handleSendMagicLink} className="space-y-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="text-sm"
            />
            {attendError && (
              <p className="text-xs text-destructive">{attendError}</p>
            )}
            <div className="flex gap-2">
              <Button type="submit" size="sm" className="flex-1" disabled={sending}>
                {sending ? 'Sending…' : 'Send magic link'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowAttendForm(false); setAttendError('') }}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => setShowAttendForm(true)}
          >
            Register to attend
          </Button>
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
          className="underline hover:text-foreground"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}
