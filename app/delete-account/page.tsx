'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PublicHeader } from '@/components/public/PublicHeader'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { supabase } from '@/lib/supabase'
import { signOutAndCleanup } from '@/lib/authClient'
import { toast } from 'sonner'
import { AlertTriangle, ChevronLeft, Mail } from 'lucide-react'

const SUPPORT_EMAIL = 'events@laalbutton.com'
const CONFIRM_TEXT = 'DELETE'

export default function DeleteAccountPage() {
  const router = useRouter()
  const { user, authResolved } = useAuthBootstrap()
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDeleteAccount() {
    if (confirm.trim().toUpperCase() !== CONFIRM_TEXT) {
      toast.error(`Type ${CONFIRM_TEXT} to confirm`)
      return
    }

    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) {
        toast.error('Please sign in again, then try deleting your account.')
        return
      }

      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((body as { error?: string }).error || 'Could not delete account')
        return
      }

      await signOutAndCleanup()
      toast.success('Your account has been deleted')
      router.replace('/')
    } catch {
      toast.error('Something went wrong. Please email us instead.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <PublicHeader />
      <div className="min-h-screen bg-background pb-20 px-4 py-8">
        <div className="max-w-xl mx-auto space-y-6">
          <Link
            href="/settings/account"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to account settings
          </Link>

          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delete your One Mic Stand account</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              This page explains how to request permanent deletion of your account and associated
              data for the <strong>One Mic Stand</strong> app (Laal Button).
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
                fraud prevention, or legal compliance (e.g. Stripe payment records), and server logs
                kept for a limited time for security. These are not used for marketing.
              </p>
            </CardContent>
          </Card>

          {authResolved && user ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Delete while signed in</CardTitle>
                <CardDescription>
                  Signed in as <span className="font-medium text-foreground">{user.email}</span>.
                  This action is permanent and cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="confirm">
                    Type <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm
                  </Label>
                  <Input
                    id="confirm"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder={CONFIRM_TEXT}
                    autoComplete="off"
                  />
                </div>
                <Button
                  variant="destructive"
                  className="w-full"
                  disabled={loading || confirm.trim().toUpperCase() !== CONFIRM_TEXT}
                  onClick={() => void handleDeleteAccount()}
                >
                  {loading ? 'Deleting…' : 'Permanently delete my account'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  You can also delete from{' '}
                  <Link href="/settings/account" className="underline underline-offset-2">
                    Settings → Account
                  </Link>
                  .
                </p>
              </CardContent>
            </Card>
          ) : authResolved ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request deletion by email</CardTitle>
                <CardDescription>
                  Sign in to delete instantly, or email us from the address on your account.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full">
                  <Link href="/login?returnTo=/delete-account">Sign in to delete account</Link>
                </Button>
                <Button asChild variant="outline" className="w-full gap-2">
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=Account%20deletion%20request`}>
                    <Mail className="h-4 w-4" />
                    Email {SUPPORT_EMAIL}
                  </a>
                </Button>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Include the email address you used to sign up. We typically process requests
                  within 30 days.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Steps (Google Play)</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <ol className="list-decimal pl-5 space-y-2 leading-relaxed">
                <li>Open One Mic Stand and sign in, or use the email option above.</li>
                <li>
                  Go to <strong>Settings → Account → Delete account</strong>, or use the form on
                  this page when signed in.
                </li>
                <li>Confirm deletion. Your account and associated app data will be removed.</li>
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
