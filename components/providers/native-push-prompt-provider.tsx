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

function snoozeKey(userId: string) {
  return `native_push_preprompt_until:${userId}`
}

function isSnoozed(userId: string) {
  try {
    const raw = window.localStorage.getItem(snoozeKey(userId))
    if (!raw) return false
    const until = Date.parse(raw)
    return Number.isFinite(until) && Date.now() < until
  } catch {
    return false
  }
}

function writeSnooze(userId: string) {
  const until = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString()
  try {
    window.localStorage.setItem(snoozeKey(userId), until)
  } catch {
    /* private mode */
  }
  return until
}

/**
 * On iOS/Android, ask for push permission after login instead of waiting for
 * Settings. Shows an in-app explanation first (Apple/Android expect context),
 * then the system dialog. If permission is already granted, registers the
 * device silently so tokens still land in the database.
 */
export function NativePushPromptProvider() {
  const { authResolved, user } = useAuthBootstrap()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const registeredThisSession = useRef(false)
  const promptedThisSession = useRef(false)

  useEffect(() => {
    if (!authResolved || !user || shouldSkipPath(pathname)) {
      setOpen(false)
      return
    }

    let cancelled = false
    const userId = user.id

    async function run() {
      const state = await getEffectivePushPermission()
      if (cancelled || !state.native || !state.supported) return

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token || cancelled) return

      if (state.permission === 'granted') {
        if (registeredThisSession.current) return
        registeredThisSession.current = true
        // Permission was already given (returning user, or they enabled it in
        // Settings). Register so FCM tokens are uploaded without another trip
        // to the in-app settings screen.
        await subscribeCurrentUserToPush(token).catch(() => {
          registeredThisSession.current = false
        })
        return
      }

      if (state.permission === 'denied') return
      if (promptedThisSession.current) return
      if (isSnoozed(userId)) return

      // Let the first screen paint before covering it.
      await new Promise((resolve) => setTimeout(resolve, 1200))
      if (cancelled || promptedThisSession.current) return
      promptedThisSession.current = true
      setOpen(true)
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [authResolved, user, pathname])

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
        await supabase.from('push_notification_prefs').upsert(
          {
            user_id: user.id,
            native_permission_denied_at: nowIso,
            last_prompted_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'user_id' },
        )
        toast.info('Notifications are blocked. You can enable them later in Settings.')
        setOpen(false)
        return
      }

      if (result.subscribed) {
        await supabase.from('push_notification_prefs').upsert(
          {
            user_id: user.id,
            subscribed_at: nowIso,
            last_prompted_at: nowIso,
            native_permission_denied_at: null,
            preprompt_dismissed_at: null,
            preprompt_dismissed_until: null,
            updated_at: nowIso,
          },
          { onConflict: 'user_id' },
        )
        toast.success('Push notifications enabled')
        setOpen(false)
        return
      }

      toast.error(result.errorMessage || 'Could not register this device for notifications')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not enable notifications')
    } finally {
      setLoading(false)
    }
  }

  async function handleNotNow() {
    if (!user) {
      setOpen(false)
      return
    }
    const until = writeSnooze(user.id)
    const nowIso = new Date().toISOString()
    await supabase.from('push_notification_prefs').upsert(
      {
        user_id: user.id,
        preprompt_dismissed_at: nowIso,
        preprompt_dismissed_until: until,
        last_prompted_at: nowIso,
        updated_at: nowIso,
      },
      { onConflict: 'user_id' },
    )
    setOpen(false)
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
