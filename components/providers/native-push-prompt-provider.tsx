'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { toast } from 'sonner'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { PushPermissionPrePrompt } from '@/components/notifications/push-permission-preprompt'
import { supabase } from '@/lib/supabase'
import {
  getEffectivePushPermission,
  subscribeCurrentUserToPush,
} from '@/lib/pushClient'

const SKIP_PREFIXES = ['/login', '/signup', '/auth', '/onboarding', '/welcome']
const SNOOZE_DAYS = 7

function shouldSkipPath(pathname: string | null) {
  if (!pathname) return true
  return SKIP_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

type PushPrefsRow = {
  subscribed_at: string | null
  preprompt_dismissed_until: string | null
  native_permission_denied_at: string | null
}

/**
 * Native app: refresh an existing token, and ask new users to enable
 * notifications after they sign in. The system permission dialog only
 * opens after they tap Enable on our in-app prompt.
 */
export function NativePushPromptProvider() {
  const { authResolved, user } = useAuthBootstrap()
  const pathname = usePathname()
  const registeredThisSession = useRef(false)
  const decidedThisSession = useRef(false)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authResolved || !user || shouldSkipPath(pathname)) return

    const userId = user.id
    let cancelled = false

    async function run() {
      const state = await getEffectivePushPermission()
      if (cancelled || !state.native || !state.supported) return

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token || cancelled) return

      const { data: prefs } = await supabase
        .from('push_notification_prefs')
        .select('subscribed_at, preprompt_dismissed_until, native_permission_denied_at')
        .eq('user_id', userId)
        .maybeSingle()

      const row = (prefs || null) as PushPrefsRow | null

      if (state.permission === 'granted' && row?.subscribed_at) {
        if (registeredThisSession.current) return
        registeredThisSession.current = true
        await subscribeCurrentUserToPush(token).catch(() => {
          registeredThisSession.current = false
        })
        return
      }

      if (decidedThisSession.current) return
      if (state.permission === 'granted' || state.permission === 'denied') return
      if (row?.subscribed_at || row?.native_permission_denied_at) return
      if (row?.preprompt_dismissed_until) {
        const until = new Date(row.preprompt_dismissed_until).getTime()
        if (Date.now() < until) return
      }

      decidedThisSession.current = true
      window.setTimeout(() => {
        if (!cancelled) setOpen(true)
      }, 1200)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [authResolved, user, pathname])

  async function upsertPrefs(patch: Record<string, string | null>) {
    if (!user) return
    await supabase.from('push_notification_prefs').upsert(
      {
        user_id: user.id,
        updated_at: new Date().toISOString(),
        ...patch,
      },
      { onConflict: 'user_id' }
    )
  }

  async function handleNotNow() {
    const now = new Date()
    const dismissedUntil = new Date(now.getTime() + SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    await upsertPrefs({
      preprompt_dismissed_at: now.toISOString(),
      preprompt_dismissed_until: dismissedUntil.toISOString(),
    })
    setOpen(false)
  }

  async function handleEnable() {
    if (!user) return
    setLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const result = await subscribeCurrentUserToPush(token)
      const nowIso = new Date().toISOString()

      if (result.permission === 'denied') {
        await upsertPrefs({
          native_permission_denied_at: nowIso,
          last_prompted_at: nowIso,
        })
        toast.info('Notifications are blocked in your phone settings.')
        setOpen(false)
        return
      }

      if (result.subscribed) {
        await upsertPrefs({
          last_prompted_at: nowIso,
          subscribed_at: nowIso,
          native_permission_denied_at: null,
          preprompt_dismissed_at: null,
          preprompt_dismissed_until: null,
        })
        setOpen(false)
        toast.success('Push notifications enabled')
      } else if (result.errorMessage) {
        toast.error(result.errorMessage)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to enable notifications')
    } finally {
      setLoading(false)
    }
  }

  return (
    <PushPermissionPrePrompt
      open={open}
      onEnable={() => void handleEnable()}
      onNotNow={() => void handleNotNow()}
      loading={loading}
    />
  )
}
