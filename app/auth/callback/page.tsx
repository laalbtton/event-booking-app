'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    async function ensureRoleOnboardingFlag(user: { user_metadata?: Record<string, any> }) {
      const pendingFromStorage = window.localStorage.getItem('pending_role_onboarding') === '1'
      const pendingFromMetadata = !!user.user_metadata?.onboarding_role_pending
      if (!pendingFromStorage || pendingFromMetadata) {
        return pendingFromStorage || pendingFromMetadata
      }

      const { error } = await supabase.auth.updateUser({
        data: {
          ...user.user_metadata,
          onboarding_role_pending: true,
        },
      })

      if (error) {
        console.warn('Could not persist onboarding role flag:', error.message)
      }
      return true
    }

    async function handleAuthCallback() {
      try {
        const url = new URL(window.location.href)
        const code = url.searchParams.get('code')

        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            console.error('Error exchanging code for session:', exchangeError)
            router.replace('/login?error=auth_failed')
            return
          }
        } else if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.replace('#', ''))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')

          if (accessToken && refreshToken) {
            const { error: sessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })

            if (sessionError) {
              console.error('Error setting session from hash:', sessionError)
              router.replace('/login?error=auth_failed')
              return
            }
          } else {
            router.replace('/login?error=no_user')
            return
          }
        } else {
          router.replace('/login?error=no_user')
          return
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          console.error('Error getting user after OAuth:', userError)
          router.replace('/login?error=no_user')
          return
        }

        const shouldShowRoleOnboarding = await ensureRoleOnboardingFlag(user)
        window.localStorage.removeItem('pending_role_onboarding')

        if (shouldShowRoleOnboarding) {
          router.replace('/onboarding/role')
          return
        }

        const avatarFromAuth = user.user_metadata?.avatar_url || user.user_metadata?.picture || null

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role, avatar_url')
          .eq('id', user.id)
          .single()

        if (!profileError && profile && !profile.avatar_url && avatarFromAuth) {
          await supabase
            .from('profiles')
            .update({ avatar_url: avatarFromAuth, updated_at: new Date().toISOString() })
            .eq('id', user.id)
        }

        if (!profileError && profile?.role === 'admin') {
          router.replace('/admin')
          return
        }

        // Fallback: check admin_users table for backward compatibility
        if (profileError) {
          const { data: adminData } = await supabase
            .from('admin_users')
            .select('*')
            .eq('user_id', user.id)
            .single()

          if (adminData) {
            router.replace('/admin')
            return
          }
        }

        router.replace('/dashboard')
      } catch (error) {
        console.error('OAuth callback error:', error)
        router.replace('/login?error=auth_failed')
      }
    }

    handleAuthCallback()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-lg">Signing you in...</div>
    </div>
  )
}
