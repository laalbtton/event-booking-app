'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, LogOut, Trash2 } from 'lucide-react'
import { signOutAndCleanup } from '@/lib/authClient'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'

export default function SettingsAccountPage() {
  const router = useRouter()
  const { user } = useAuthBootstrap()

  return (
    <div className="min-h-screen bg-background pb-20">
<div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Account</h1>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Sign out</CardTitle>
            <CardDescription className="space-y-1">
              {user?.email && (
                <span className="block text-muted-foreground break-all">{user.email}</span>
              )}
              <span className="block">Sign out of your account on this device.</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="destructive"
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

        <Card className="shadow-sm border-destructive/30">
          <CardHeader>
            <CardTitle className="text-xl text-destructive">Delete account</CardTitle>
            <CardDescription>
              Permanently delete your account and associated data. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full gap-2 border-destructive/50 text-destructive hover:bg-destructive/10">
              <Link href="/delete-account">
                <Trash2 className="w-4 h-4" />
                Delete account
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
