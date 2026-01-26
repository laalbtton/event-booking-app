'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
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

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

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
