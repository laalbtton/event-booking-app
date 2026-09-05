'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { redeemPendingAppInvite, setPendingAppInviteToken } from '@/lib/appInviteClient'

function LoginContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()

  function shouldRouteToRoleOnboarding(user: { user_metadata?: Record<string, any> }) {
    const pendingFromMetadata = !!user.user_metadata?.onboarding_role_pending
    const pendingFromStorage =
      typeof window !== 'undefined' && window.localStorage.getItem('pending_role_onboarding') === '1'
    return pendingFromMetadata || pendingFromStorage
  }

  useEffect(() => {
    const inviteToken = searchParams.get('invite')
    if (inviteToken) {
      setPendingAppInviteToken(inviteToken)
    }
    const returnTo = searchParams.get('returnTo')
    if (returnTo && typeof window !== 'undefined') {
      window.sessionStorage.setItem('signup_returnTo', returnTo)
    }
    // Capture performer referral ID (login = returning user, but preserve in case
    // they created an account and are now confirming via the login page)
    const ref = searchParams.get('ref')
    if (ref && typeof window !== 'undefined') {
      window.sessionStorage.setItem('signup_ref', ref)
    }
  }, [searchParams])

  useEffect(() => {
    async function handleHashAuth() {
      if (typeof window === 'undefined') return

      const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (!accessToken || !refreshToken) return

      setLoading(true)
      setError('')
      try {
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (sessionError) {
          throw sessionError
        }

        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await redeemPendingAppInvite(session.access_token)
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          throw userError || new Error('No user returned after OAuth')
        }

        if (shouldRouteToRoleOnboarding(user)) {
          window.localStorage.removeItem('pending_role_onboarding')
          router.replace('/onboarding/role')
          return
        }

        const avatarFromAuth = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', user.id)
          .single()

        if (profile && !profile.avatar_url && avatarFromAuth) {
          await supabase
            .from('profiles')
            .update({ avatar_url: avatarFromAuth, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        }

        if (profile?.role === 'admin') {
          router.replace('/admin')
        } else {
          router.replace('/dashboard')
        }
      } catch (authError: any) {
        console.error('OAuth hash sign-in error:', authError)
        setError('Google sign-in failed. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    handleHashAuth()
  }, [router])

  // Email/password login (existing)
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      if (data.session?.access_token) {
        await redeemPendingAppInvite(data.session.access_token)
      }

      if (shouldRouteToRoleOnboarding(data.user)) {
        window.localStorage.removeItem('pending_role_onboarding')
        router.push('/onboarding/role')
        return
      }

      // Honour returnTo if set
      const returnTo = typeof window !== 'undefined' ? window.sessionStorage.getItem('signup_returnTo') : null
      if (returnTo) {
        window.sessionStorage.removeItem('signup_returnTo')
        router.push(returnTo)
        return
      }

      // Check if admin
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', data.user.id)
        .single()

      if (adminData) {
        router.push('/admin')
      } else {
        router.push('/dashboard')
      }
    } catch (error: any) {
      // Provide more helpful error messages
      if (error.message?.includes('Email not confirmed') || error.message?.includes('email_not_confirmed')) {
        setError('Please verify your email address before logging in. Check your inbox for the verification email.')
      } else {
        setError(error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)

    try {
      const inviteToken = searchParams.get('invite')
      if (inviteToken) {
        setPendingAppInviteToken(inviteToken)
      }

      // Detect whether we're inside the native Capacitor shell.
      let isNative = false
      try {
        const { Capacitor } = await import('@capacitor/core')
        isNative = Capacitor.isNativePlatform()
      } catch { /* running on web */ }

      if (isNative) {
        // On Android/iOS we must NOT let Supabase redirect the WebView itself —
        // that breaks out into the system browser.  Instead:
        //  1. Get the OAuth URL without navigating  (skipBrowserRedirect)
        //  2. Open it in a Capacitor Browser tab (Chrome Custom Tabs on Android)
        //  3. After auth Google redirects to com.laalbutton.app://auth/callback
        //  4. Android intercepts the custom scheme and fires appUrlOpen in the app
        //  5. CapacitorProvider exchanges the code and navigates to /dashboard
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: 'com.laalbutton.app://auth/callback',
            skipBrowserRedirect: true,
          },
        })
        if (error) throw error
        if (data.url) {
          const { Browser } = await import('@capacitor/browser')
          await Browser.open({ url: data.url })
        }
        // Keep loading=true — CapacitorProvider will navigate away once the
        // appUrlOpen callback fires; the user never returns to this screen.
        return
      }

      // Web: standard OAuth redirect flow
      const redirectUrl = `${window.location.origin}/auth/callback`
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl },
      })
      if (error) throw error
    } catch (error: any) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-neutral-900 to-stone-900 px-4 py-12 sm:py-16">
      <Card className="max-w-md w-full shadow-2xl border-red-600/55 bg-zinc-900 text-stone-100">
        <CardHeader className="space-y-2 pb-6">
          <CardTitle className="text-3xl font-bold text-center tracking-tight text-yellow-400">Login</CardTitle>
          <CardDescription className="text-center text-base text-stone-400">Sign in to manage your performances and event bookings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm border border-destructive/20 leading-relaxed">
              {error}
            </div>
          )}

          {/* Google Login Button */}
          <Button
            onClick={handleGoogleLogin}
            disabled={loading}
            variant="outline"
            className="w-full h-11 text-base font-medium border-zinc-600 bg-zinc-800 text-stone-100 hover:bg-zinc-700 hover:text-stone-50"
            type="button"
          >
            <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>

          <div className="relative my-6">
            <Separator className="bg-zinc-700" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-zinc-900 px-3 text-sm text-stone-400 font-medium">Or continue with email</span>
            </div>
          </div>

          {/* Email/password form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2.5">
              <Label htmlFor="email" className="text-sm font-semibold text-stone-200">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="h-11 bg-zinc-800 border-zinc-600 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
              />
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="password" className="text-sm font-semibold text-stone-200">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="h-11 bg-zinc-800 border-zinc-600 text-stone-100 placeholder:text-stone-500 focus:border-yellow-400"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base font-semibold bg-yellow-400 text-zinc-950 hover:bg-yellow-300"
            >
              {loading ? 'Logging in...' : 'Login with Email'}
            </Button>
          </form>

          <div className="pt-2">
            <p className="text-center text-sm text-stone-400">
              Don't have an account?{' '}
              <Link href="/signup" className="text-yellow-400 hover:text-yellow-300 underline underline-offset-2 font-semibold transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-950 via-neutral-900 to-stone-900 px-4 py-12 sm:py-16">
        <div className="text-stone-400">Loading...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}