'use client'

import { useEffect } from 'react'
import { initInstallPromptCapture } from '@/lib/installPromptClient'

export function PushServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Skip service worker registration when running inside the Capacitor
    // native shell — FCM handles push notifications there.
    async function maybeRegisterSW() {
      try {
        const { Capacitor } = await import('@capacitor/core')
        if (Capacitor.isNativePlatform()) return
      } catch {
        // @capacitor/core not available in this environment — proceed with SW.
      }

      initInstallPromptCapture()
      if (!('serviceWorker' in navigator)) return
      if (!window.isSecureContext) return

      navigator.serviceWorker.register('/sw.js').catch((error) => {
        console.warn('Failed to register service worker for push:', error)
      })
    }

    maybeRegisterSW()
  }, [])

  return null
}
