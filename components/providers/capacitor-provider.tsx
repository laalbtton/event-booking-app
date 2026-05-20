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
      const appUrlHandle = await App.addListener('appUrlOpen', async (event) => {
        try {
          // ── OAuth callback from Google Sign-in ──────────────────────────
          // After the user authenticates in the Capacitor Browser tab, Google
          // redirects to  com.laalbutton.app://auth/callback?code=<pkce_code>
          // Android intercepts the custom scheme and fires this event.
          if (event.url.startsWith('com.laalbutton.app://auth/callback')) {
            // Close the Chrome Custom Tab immediately so the user is back in-app.
            try {
              const { Browser } = await import('@capacitor/browser')
              await Browser.close()
            } catch { /* best-effort */ }

            // Parse the code out of the custom-scheme URL.
            // URL() requires an http/https scheme so we normalise it first.
            const normalised = event.url.replace('com.laalbutton.app://', 'https://app.laalbutton.com/')
            const parsed = new URL(normalised)
            const code = parsed.searchParams.get('code')

            if (code) {
              const { supabase } = await import('@/lib/supabase')
              const { error } = await supabase.auth.exchangeCodeForSession(code)
              if (error) {
                console.error('OAuth code exchange failed:', error.message)
                router.replace('/login?error=auth_failed')
              } else {
                router.replace('/dashboard')
              }
            } else {
              // Fallback: implicit-flow tokens arrive in the hash fragment.
              const hash = parsed.hash.replace('#', '')
              const hashParams = new URLSearchParams(hash)
              const accessToken = hashParams.get('access_token')
              const refreshToken = hashParams.get('refresh_token')
              if (accessToken && refreshToken) {
                const { supabase } = await import('@/lib/supabase')
                const { error } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken,
                })
                router.replace(error ? '/login?error=auth_failed' : '/dashboard')
              } else {
                router.replace('/login?error=no_code')
              }
            }
            return
          }

          // ── Regular deep link (notification taps, shared links, etc.) ───
          const url = new URL(event.url)
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
