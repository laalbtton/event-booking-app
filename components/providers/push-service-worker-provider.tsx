'use client'

import { useEffect } from 'react'

export function PushServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (!window.isSecureContext) return

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Failed to register service worker for push:', error)
    })
  }, [])

  return null
}

