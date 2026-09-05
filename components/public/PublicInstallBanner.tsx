'use client'

import { useEffect, useState } from 'react'
import {
  isStandaloneMode,
  getInstallPlatform,
  hasDeferredInstallPrompt,
  triggerDeferredInstallPrompt,
} from '@/lib/installPromptClient'

const DISMISS_KEY = 'public_install_banner_dismissed'

export function PublicInstallBanner() {
  const [visible, setVisible] = useState(false)
  const [platform, setPlatform] = useState<'ios' | 'android' | 'other'>('other')
  const [showIosInstructions, setShowIosInstructions] = useState(false)

  useEffect(() => {
    if (isStandaloneMode()) return
    const dismissed = typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1'
    if (dismissed) return

    const detected = getInstallPlatform()
    if (detected === 'other') return // Desktop — no banner

    setPlatform(detected)
    setVisible(true)
  }, [])

  function dismiss() {
    if (typeof window !== 'undefined') window.localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  async function handleInstall() {
    if (platform === 'ios') {
      setShowIosInstructions(true)
      return
    }
    const result = await triggerDeferredInstallPrompt()
    if (result.outcome === 'accepted') {
      dismiss()
    }
  }

  if (!visible) return null

  return (
    <div className="mt-3">
      <div className="flex items-start gap-3 rounded-xl border border-red-600/35 bg-zinc-800/60 p-4 shadow-sm">
        <div className="shrink-0 text-xl">📱</div>
        <div className="flex-1 min-w-0">
          {showIosInstructions ? (
            <div className="text-sm space-y-1">
              <p className="font-medium text-stone-200">Add to Home Screen</p>
              <p className="text-stone-400 text-xs">
                Tap the Share button in Safari, then &ldquo;Add to Home Screen&rdquo; for the best experience.
              </p>
              <button
                type="button"
                onClick={dismiss}
                className="text-xs underline text-stone-500 hover:text-stone-300 mt-1"
              >
                Got it, dismiss
              </button>
            </div>
          ) : (
            <div className="text-sm space-y-1">
              <p className="font-medium text-stone-200">Get the app</p>
              <p className="text-stone-400 text-xs">
                Add One Mic Stand to your home screen for the best experience — no app store required.
              </p>
              <button
                type="button"
                onClick={handleInstall}
                className="text-xs font-medium text-yellow-400 underline hover:text-yellow-300 mt-1"
              >
                {platform === 'ios' ? 'Show me how' : 'Add to Home Screen'}
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="shrink-0 text-stone-500 hover:text-stone-300 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
