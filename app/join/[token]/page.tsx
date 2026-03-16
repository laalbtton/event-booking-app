'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { setPendingCommunityInviteToken } from '@/lib/communityInviteClient'
import { supabase } from '@/lib/supabase'

type LinkInfo = {
  community: {
    id: string
    name: string
    description: string | null
    location: string | null
    slug: string | null
  }
  targetRole: string
  expiresAt: string
}

export default function CommunityJoinPage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params.token || '')

  const [info, setInfo] = useState<LinkInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return

    async function fetchInfo() {
      try {
        const res = await fetch(`/api/community-invite-links/${token}`)
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || 'Invalid invite link')
          return
        }
        setInfo(data as LinkInfo)
        setPendingCommunityInviteToken(token)

        // If user is already logged in, redeem immediately and redirect
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.access_token) {
            const redeemRes = await fetch('/api/community-invite-links/redeem', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ token }),
            })
            if (redeemRes.ok) {
              // Clear the stored token since we redeemed it directly
              import('@/lib/communityInviteClient').then(m => m.clearPendingCommunityInviteToken())
              router.replace('/dashboard')
              return
            }
          }
        }
      } catch {
        setError('Could not load invite information.')
      } finally {
        setLoading(false)
      }
    }

    void fetchInfo()
  }, [token, router])

  const roleLabel = info?.targetRole === 'event_creator' ? 'Event Creator' :
    info?.targetRole === 'co_admin' ? 'Co-Admin' : 'Member'

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted-foreground text-sm">Loading invite…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Invite Unavailable</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link href="/">Go to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="space-y-2 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary">{roleLabel} Invite</Badge>
          </div>
          <CardTitle className="text-2xl font-bold">
            You&apos;re invited to join
          </CardTitle>
          <p className="text-xl font-semibold text-primary">{info?.community.name}</p>
          {info?.community.description && (
            <CardDescription className="text-sm leading-relaxed">
              {info.community.description}
            </CardDescription>
          )}
          {info?.community.location && (
            <p className="text-sm text-muted-foreground">{info.community.location}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            You&apos;ll join as an <strong>{roleLabel}</strong> — which lets you create and submit events for this community.
          </p>
          <Button className="w-full" onClick={() => router.push('/signup')}>
            Sign Up to Join
          </Button>
          <Button className="w-full" variant="outline" onClick={() => router.push('/login')}>
            I Already Have an Account
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Your invite will be applied automatically after you sign in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
