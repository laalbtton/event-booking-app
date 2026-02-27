'use client'

import { useEffect } from 'react'
import { initInstallPromptCapture } from '@/lib/installPromptClient'

export function PushServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    initInstallPromptCapture()
    if (!('serviceWorker' in navigator)) return
    if (!window.isSecureContext) return

    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Failed to register service worker for push:', error)
    })
  }, [])

  return null
}

