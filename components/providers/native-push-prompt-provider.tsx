'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { supabase } from '@/lib/supabase'
import {
  getEffectivePushPermission,
  subscribeCurrentUserToPush,
} from '@/lib/pushClient'

const SKIP_PREFIXES = ['/login', '/signup', '/auth', '/onboarding', '/welcome']

function shouldSkipPath(pathname: string | null) {
  if (!pathname) return true
  return SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * On native apps, only refresh an already opted-in device token.
 * Do not auto-prompt for permission — App Store guideline 4.5.4 requires
 * an explicit Settings opt-in before notifications are enabled.
 */
export function NativePushPromptProvider() {
  const { authResolved, user } = useAuthBootstrap()
  const pathname = usePathname()
  const registeredThisSession = useRef(false)

  useEffect(() => {
    if (!authResolved || !user || shouldSkipPath(pathname)) return

    const userId = user.id
    let cancelled = false

    async function run() {
      const state = await getEffectivePushPermission()
      if (cancelled || !state.native || !state.supported) return
      if (state.permission !== 'granted') return

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token || cancelled) return

      const { data: prefs } = await supabase
        .from('push_notification_prefs')
        .select('subscribed_at')
        .eq('user_id', userId)
        .maybeSingle()

      if (!prefs?.subscribed_at) return
      if (registeredThisSession.current) return
      registeredThisSession.current = true
      await subscribeCurrentUserToPush(token).catch(() => {
        registeredThisSession.current = false
      })
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [authResolved, user, pathname])

  return null
}
