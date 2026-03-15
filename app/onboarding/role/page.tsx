'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { isStandaloneMode } from '@/lib/installPromptClient'

export default function RoleOnboardingPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState<'performer' | 'audience' | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const pendingFromMetadata = !!user.user_metadata?.onboarding_role_pending
      const pendingFromStorage =
        typeof window !== 'undefined' && window.localStorage.getItem('pending_role_onboarding') === '1'

      if (!pendingFromMetadata && !pendingFromStorage) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'admin') {
          router.replace('/admin')
          return
        }
        router.replace('/dashboard')
        return
      }

      setLoading(false)
    }

    load()
  }, [router])

  async function handleContinue() {
    if (!selectedRole) {
      setError('Please select a role to continue.')
      return
    }

    setError('')
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ role: selectedRole, updated_at: new Date().toISOString() })
        .eq('id', user.id)

      if (profileError) throw profileError

      await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          onboarding_role_pending: false,
        },
      })

      // Auto-join all public active communities
      try {
        const { data: publicCommunities } = await supabase
          .from('communities')
          .select('id')
          .eq('is_public', true)
          .eq('status', 'active')

        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (token && publicCommunities) {
          await Promise.allSettled(
            publicCommunities.map((c: { id: string }) =>
              fetch(`/api/communities/${c.id}/join`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
              })
            )
          )
        }
      } catch {
        // Non-blocking — onboarding continues regardless
      }

      window.localStorage.removeItem('pending_role_onboarding')
      if (isStandaloneMode()) {
        router.replace('/dashboard')
      } else {
        router.replace('/onboarding/install')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save your role')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading onboarding...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12 sm:py-16">
      <Card className="max-w-md w-full shadow-lg">
        <CardHeader className="space-y-2 pb-6">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">Step 2 of 2</p>
          <CardTitle className="text-3xl font-bold text-center tracking-tight">Choose your role</CardTitle>
          <CardDescription className="text-center text-base">
            Select how you want to use the app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20 leading-relaxed">
              {error}
            </div>
          )}

          <div className="space-y-2.5">
            <Label className="text-sm font-semibold">I want to join as</Label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-2 text-sm',
                  selectedRole === 'performer'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value="performer"
                  checked={selectedRole === 'performer'}
                  onChange={() => setSelectedRole('performer')}
                  className="sr-only"
                />
                Performer
              </label>
              <label
                className={cn(
                  'cursor-pointer rounded-md border px-3 py-2 text-sm',
                  selectedRole === 'audience'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value="audience"
                  checked={selectedRole === 'audience'}
                  onChange={() => setSelectedRole('audience')}
                  className="sr-only"
                />
                Audience
              </label>
            </div>
          </div>

          <Button
            onClick={handleContinue}
            disabled={submitting || !selectedRole}
            className="w-full h-11 text-base font-semibold"
          >
            {submitting ? 'Saving...' : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
