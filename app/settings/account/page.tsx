'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, LogOut } from 'lucide-react'
import { signOutAndCleanup } from '@/lib/authClient'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { DeleteAccountForm } from '@/components/DeleteAccountForm'

export default function SettingsAccountPage() {
  const router = useRouter()
  const { user, authResolved } = useAuthBootstrap()

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.replace('/login?returnTo=/settings/account')
    }
  }, [authResolved, user, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash === '#delete') {
      document.getElementById('delete-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [authResolved, user])

  if (!authResolved || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Account</h1>
        </div>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Sign out</CardTitle>
            <CardDescription className="space-y-1">
              {user.email && (
                <span className="block text-muted-foreground break-all">{user.email}</span>
              )}
              <span className="block">Sign out of your account on this device.</span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={async () => {
                await signOutAndCleanup()
                router.push('/')
              }}
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>

        <Card id="delete-account" className="shadow-sm border-destructive/30 scroll-mt-20">
          <CardHeader>
            <CardTitle className="text-xl text-destructive">Delete account</CardTitle>
            <CardDescription>
              Permanently delete your account in the app. You do not need to email us or visit a website.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
