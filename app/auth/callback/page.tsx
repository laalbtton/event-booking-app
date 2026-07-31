'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { redeemPendingAppInvite } from '@/lib/appInviteClient'

export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    async function ensureRoleOnboardingFlag(user: { user_metadata?: Record<string, unknown> }) {
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

    /**
     * Magic-link "attend" flow:
     * - New users: set role=audience, auto-join communities, create booking
     * - Existing users: create booking (idempotent — already-booked is ignored)
     * - Redirects back to the event page either way
     */
    async function handleAttendIntent(
      user: { id: string; user_metadata?: Record<string, unknown> },
      session: { access_token: string },
      eventId: string,
      eventSlug: string,
    ) {
      // 1. Check if this is a new user without a role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const isNewUser = !profile?.role

      if (isNewUser) {
        // Set audience role directly — skip the role-selection onboarding screen
        await supabase
          .from('profiles')
          .update({ role: 'audience', updated_at: new Date().toISOString() })
          .eq('id', user.id)

        await supabase.auth.updateUser({
          data: { ...user.user_metadata, onboarding_role_pending: false },
        })

        // Auto-join all public active communities (same as normal onboarding)
        try {
          const { data: publicCommunities } = await supabase
            .from('communities')
            .select('id')
            .eq('is_public', true)
            .eq('status', 'active')

          if (publicCommunities) {
            await Promise.allSettled(
              publicCommunities.map((c: { id: string }) =>
                fetch(`/api/communities/${c.id}/join`, {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${session.access_token}` },
                }),
              ),
            )
          }
        } catch {
          // Non-blocking
        }

        window.localStorage.removeItem('pending_role_onboarding')

        // Sync new user to Resend marketing segment (non-blocking). This flow
        // assigns a role directly and skips /onboarding/role, which is the
        // only other place this sync happens — so it must be done here too.
        fetch('/api/auth/sync-resend-contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {})
      }

      // 2. Create the audience booking (idempotent — ignore "already booked" errors)
      try {
        await fetch('/api/bookings/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ eventId }),
        })
      } catch {
        // Non-blocking — redirect to event even if booking fails
      }

      // 3. Send them back to the event page with a welcome flag
      router.replace(`/events/${eventSlug}?attended=1`)
    }

    /**
     * Brampton Comedy Insider magic-link flow:
     * - Always assign audience role and auto-join public communities
     * - Activate founding member + sync redeemable credits to profile
     * - Redirect to the campaign page with an activated flag
     */
    async function handleInsiderIntent(
      user: { id: string; user_metadata?: Record<string, unknown>; email?: string },
      session: { access_token: string },
    ) {
      // Campaign signups are always audience members.
      const profileUpdate: Record<string, unknown> = {
        role: 'audience',
        updated_at: new Date().toISOString(),
      }

      const userEmail = user.email?.trim().toLowerCase()
      if (userEmail) {
        const { data: member } = await supabase
          .from('founding_members')
          .select('first_name')
          .eq('email', userEmail)
          .maybeSingle()
        if (member?.first_name) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .maybeSingle()
          if (!profile?.full_name) {
            profileUpdate.full_name = member.first_name
          }
        }
      }

      await supabase.from('profiles').update(profileUpdate).eq('id', user.id)

      await supabase.auth.updateUser({
        data: { ...user.user_metadata, onboarding_role_pending: false },
      })

      try {
        const { data: publicCommunities } = await supabase
          .from('communities')
          .select('id')
          .eq('is_public', true)
          .eq('status', 'active')

        if (publicCommunities) {
          await Promise.allSettled(
            publicCommunities.map((c: { id: string }) =>
              fetch(`/api/communities/${c.id}/join`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${session.access_token}` },
              }),
            ),
          )
        }
      } catch {
        // Non-blocking
      }

      window.localStorage.removeItem('pending_role_onboarding')

      // Sync new user to Resend marketing segment (non-blocking). This flow
      // assigns a role directly and skips /onboarding/role, which is the
      // only other place this sync happens — so it must be done here too.
      fetch('/api/auth/sync-resend-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      }).catch(() => {})

      // Mark the founding member account as activated (email comes from the session server-side)
      try {
        await fetch('/api/founding-members/activate', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
      } catch {
        // Non-blocking
      }

      router.replace('/brampton-comedy-insider?activated=1')
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

        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await redeemPendingAppInvite(session.access_token)
        }

        // ── Magic-link attend intent ─────────────────────────────────────
        const intent = url.searchParams.get('intent')
        const eventId = url.searchParams.get('eventId')
        const eventSlug = url.searchParams.get('eventSlug')

        if (intent === 'attend' && eventId && eventSlug && session?.access_token) {
          await handleAttendIntent(user, session, eventId, eventSlug)
          return
        }

        // ── Brampton Comedy Insider campaign intent ──────────────────────
        if (intent === 'insider' && session?.access_token) {
          await handleInsiderIntent(user, session)
          return
        }
        // ────────────────────────────────────────────────────────────────

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
            .update({ avatar_url: avatarFromAuth as string, updated_at: new Date().toISOString() })
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
      <div className="text-lg">Signing you in…</div>
    </div>
  )
}
