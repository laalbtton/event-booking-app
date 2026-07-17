'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type ReferralInviteCardProps = {
  userId: string
  className?: string
  /** Compact layout for embedding under profile sections */
  compact?: boolean
  /** Dark styling for public performer profiles */
  variant?: 'default' | 'dark'
  /** First name used in guest CTA copy on public profiles */
  performerName?: string
  /** Show signup / login actions for logged-out visitors */
  showGuestActions?: boolean
}

export function canShowReferralInvite(role: string | null | undefined): boolean {
  return role === 'performer' || role === 'event_creator'
}

export function getReferralSignupUrl(userId: string, origin?: string): string {
  const base =
    (origin || '').replace(/\/$/, '') ||
    (process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '') ||
    'https://onemicstand.com'
  return `${base}/signup?ref=${encodeURIComponent(userId)}&role=audience`
}

export function ReferralInviteCard({
  userId,
  className,
  compact = false,
  variant = 'default',
  performerName,
  showGuestActions = false,
}: ReferralInviteCardProps) {
  const [copied, setCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState(() => getReferralSignupUrl(userId))
  const isDark = variant === 'dark'
  const firstName = (performerName || 'This performer').split(' ')[0]
  const signupHref = `/signup?ref=${encodeURIComponent(userId)}&role=audience`
  const loginHref = `/login?ref=${encodeURIComponent(userId)}`

  useEffect(() => {
    setInviteUrl(getReferralSignupUrl(userId, window.location.origin))
  }, [userId])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      toast.success('Invite link copied')
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  const body = (
    <>
      <div className={cn('flex flex-col gap-1', isDark ? 'text-center sm:text-left' : undefined)}>
        <h3
          className={cn(
            'font-semibold',
            compact ? 'text-base' : 'text-xl',
            isDark ? 'text-yellow-400' : undefined,
          )}
        >
          {showGuestActions ? `Join via ${firstName}` : 'Invite audience'}
        </h3>
        <p className={cn('text-sm', isDark ? 'text-stone-400' : 'text-muted-foreground')}>
          {showGuestActions
            ? `${firstName} invited you to One Mic Stand — scan the QR or use the join link below.`
            : "Share this QR or link. When someone joins through it, you earn 2 Ryan's Chai venue credits."}
        </p>
      </div>
      <div className="flex flex-col items-center gap-4">
        <div className="bg-white p-3 rounded-lg border border-border">
          <QRCodeSVG value={inviteUrl} size={compact ? 140 : 180} level="M" includeMargin={false} />
        </div>
        <p
          className={cn(
            'text-xs text-center max-w-sm break-all',
            isDark ? 'text-stone-500' : 'text-muted-foreground',
          )}
        >
          {inviteUrl}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyLink}
          className={cn(
            'gap-2',
            isDark &&
              'border-zinc-600 bg-zinc-900 text-stone-200 hover:bg-zinc-800 hover:text-yellow-400',
          )}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy invite link'}
        </Button>
        {showGuestActions && (
          <div className="flex w-full flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300 font-bold">
              <Link href={signupHref}>Join the app</Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-zinc-600 bg-transparent text-stone-300 hover:border-zinc-400 hover:bg-zinc-900"
            >
              <Link href={loginHref}>Already have an account? Sign in</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  )

  if (isDark) {
    return (
      <div
        className={cn(
          'rounded-2xl border border-yellow-400/30 bg-yellow-400/5 p-6 space-y-5',
          className,
        )}
      >
        {body}
      </div>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className={compact ? 'pb-3' : undefined}>
        <CardTitle className={compact ? 'text-base' : 'text-xl'}>Invite audience</CardTitle>
        <CardDescription>
          Share this QR or link. When someone joins through it, you earn 2 Ryan&apos;s Chai venue credits.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        <div className="bg-white p-3 rounded-lg border border-border">
          <QRCodeSVG value={inviteUrl} size={compact ? 140 : 180} level="M" includeMargin={false} />
        </div>
        <p className="text-xs text-muted-foreground text-center max-w-sm break-all">{inviteUrl}</p>
        <Button type="button" variant="outline" size="sm" onClick={copyLink} className="gap-2">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy invite link'}
        </Button>
      </CardContent>
    </Card>
  )
}
