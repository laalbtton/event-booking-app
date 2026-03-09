'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { setPendingAppInviteToken } from '@/lib/appInviteClient'

export default function WelcomeInvitePage() {
  const params = useParams()
  const router = useRouter()
  const token = String(params.token || '')

  useEffect(() => {
    if (!token) return
    setPendingAppInviteToken(token)
  }, [token])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>Welcome Invite</CardTitle>
          <CardDescription>
            This invite will apply welcome credits to your account after signup/login.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full" onClick={() => router.push('/signup')}>
            Continue to Sign Up
          </Button>
          <Button className="w-full" variant="outline" onClick={() => router.push('/login')}>
            I Already Have an Account
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            You can also <Link href="/dashboard" className="underline">continue to dashboard</Link> if already logged in.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
