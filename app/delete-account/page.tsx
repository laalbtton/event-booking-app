'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PublicHeader } from '@/components/public/PublicHeader'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { DeleteAccountForm } from '@/components/DeleteAccountForm'
import { AlertTriangle, ChevronLeft } from 'lucide-react'

export default function DeleteAccountPage() {
  const { user, authResolved } = useAuthBootstrap()

  return (
    <>
      {(!authResolved || !user) && <PublicHeader />}
      <div className="min-h-screen bg-background pb-20 px-4 py-8">
        <div className="max-w-xl mx-auto space-y-6">
          <Link
            href={user ? '/settings/account' : '/settings'}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            {user ? 'Back to account settings' : 'Back'}
          </Link>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delete your One Mic Stand account</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              You can permanently delete your account in the app. No email or website visit is required.
            </p>
          </div>

          <Card className="border-amber-200/80 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                What gets deleted
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2 leading-relaxed">
              <p>When your account is deleted, we remove or anonymize:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Your profile (name, email, bio, social links, avatar)</li>
                <li>Bookings and attendance records tied to your account</li>
                <li>Push notification preferences and device tokens</li>
                <li>Community memberships and notification settings</li>
              </ul>
              <p className="pt-1">
                <strong>May be retained:</strong> financial transaction records required for tax,
                fraud prevention, or legal compliance (for example Stripe payment records), and
                server logs kept for a limited time for security.
              </p>
            </CardContent>
          </Card>

          {authResolved && user ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg text-destructive">Delete while signed in</CardTitle>
                <CardDescription>
                  Signed in as <span className="font-medium text-foreground">{user.email}</span>.
                  This action is permanent and cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DeleteAccountForm />
              </CardContent>
            </Card>
          ) : authResolved ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Sign in to delete</CardTitle>
                <CardDescription>
                  Sign in with the account you want to delete, then confirm in the app.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild className="w-full">
                  <Link href="/login?returnTo=/settings/account">Sign in to delete account</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How to delete in the app</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                <li>Open One Mic Stand and sign in.</li>
                <li>Go to <strong>Settings → Delete account</strong> (or Settings → Account).</li>
                <li>Type DELETE and tap <strong>Permanently delete my account</strong>.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
