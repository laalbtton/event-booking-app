'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

type ReferralInviteCardProps = {
  userId: string
  className?: string
  /** Compact layout for embedding under profile sections */
  compact?: boolean
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

export function ReferralInviteCard({ userId, className, compact = false }: ReferralInviteCardProps) {
  const [copied, setCopied] = useState(false)
  const [inviteUrl, setInviteUrl] = useState(() => getReferralSignupUrl(userId))

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
