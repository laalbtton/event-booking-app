'use client'

import { useEffect } from 'react'
import { applySafeAreaFallbacks } from '@/lib/safeAreaInsets'

/**
 * Opaque strip behind the phone clock / status icons so scrolling content
 * cannot show through. Height is 0 when the native status bar already
 * sits above the WebView.
 */
export function AppSystemInsetChrome() {
  useEffect(() => {
    applySafeAreaFallbacks({
      nativeStatusBarInset: document.documentElement.classList.contains('native-status-bar-inset'),
    })
  }, [])

  return <div aria-hidden className="app-status-fill" />
}
