'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * CapacitorProvider
 *
 * Mounts only the native event listeners needed for the Capacitor Android/iOS
 * shell.  When the app is running in a web browser, Capacitor.isNativePlatform()
 * returns false and every listener is skipped, so web users are completely
 * unaffected.
 *
 * Responsibilities:
 *  1. Deep link routing via App.addListener('appUrlOpen')
 *  2. Foreground push notification display (dispatches a CustomEvent so any
 *     component can render an in-app banner)
 *  3. Notification tap → navigate to the correct screen
 *  4. FCM token refresh → re-upload to /api/push/register-fcm
 */
export function CapacitorProvider() {
  const router = useRouter()

  useEffect(() => {
    let cleanupFns: Array<() => void> = []

    async function init() {
      let isNative = false
      try {
        const { Capacitor } = await import('@capacitor/core')
        isNative = Capacitor.isNativePlatform()
      } catch {
        return
      }

      if (!isNative) return

      const [{ App }, { PushNotifications }, { Capacitor }] = await Promise.all([
        import('@capacitor/app'),
        import('@capacitor/push-notifications'),
        import('@capacitor/core'),
      ])

      // ─── 1. Deep link handler ───────────────────────────────────────────────
      const appUrlHandle = await App.addListener('appUrlOpen', (event) => {
        try {
          const url = new URL(event.url)
          // Navigate to the in-app path, stripping the host.
          router.push(url.pathname + url.search + url.hash)
        } catch {
          // Malformed URL — ignore.
        }
      })
      cleanupFns.push(() => appUrlHandle.remove())

      // ─── 2. Foreground notification banner ─────────────────────────────────
      // Dispatch a CustomEvent that any component can listen to in order to
      // render an in-app notification banner.
      const foregroundHandle = await PushNotifications.addListener(
        'pushNotificationReceived',
        (notification) => {
          window.dispatchEvent(
            new CustomEvent('nativePushReceived', { detail: notification })
          )
        }
      )
      cleanupFns.push(() => foregroundHandle.remove())

      // ─── 3. Notification tap (app was backgrounded or killed) ──────────────
      const tapHandle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (action) => {
          const route =
            (action.notification.data?.route as string | undefined) ?? '/dashboard'
          router.push(route)
        }
      )
      cleanupFns.push(() => tapHandle.remove())

      // ─── 4. FCM token refresh ───────────────────────────────────────────────
      // 'registration' fires on first register() AND on token refresh.
      // We re-upload the token to keep Supabase in sync.
      const tokenHandle = await PushNotifications.addListener(
        'registration',
        async (token) => {
          try {
            // Get the current session to authorise the request.
            const { createClient } = await import('@supabase/supabase-js')
            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            )
            const {
              data: { session },
            } = await supabase.auth.getSession()
            if (!session?.access_token) return

            await fetch('/api/push/register-fcm', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({
                fcmToken: token.value,
                platform: Capacitor.getPlatform(),
              }),
            })
          } catch {
            // Non-fatal — token refresh failures are retried on next app open.
          }
        }
      )
      cleanupFns.push(() => tokenHandle.remove())
    }

    init()

    return () => {
      cleanupFns.forEach((fn) => fn())
    }
  }, [router])

  return null
}
