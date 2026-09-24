'use client'

import { useEffect, useState } from 'react'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appStores'
import { EmailUpdatesSubscribe } from '@/components/public/EmailUpdatesSubscribe'
import {
  getInstallPlatform,
  hasDeferredInstallPrompt,
  initInstallPromptCapture,
  isStandaloneMode,
  subscribeToInstallPromptChanges,
  triggerDeferredInstallPrompt,
  type InstallPlatform,
} from '@/lib/installPromptClient'
import { toast } from 'sonner'

export function DownloadOptions() {
  const [platform, setPlatform] = useState<InstallPlatform>('other')
  const [promptAvailable, setPromptAvailable] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    initInstallPromptCapture()
    setPlatform(getInstallPlatform())
    setPromptAvailable(hasDeferredInstallPrompt())
    setStandalone(isStandaloneMode())
    return subscribeToInstallPromptChanges(() => {
      setPromptAvailable(hasDeferredInstallPrompt())
      setStandalone(isStandaloneMode())
    })
  }, [])

  async function handleWebInstall() {
    if (platform === 'android' && promptAvailable) {
      setInstalling(true)
      try {
        const result = await triggerDeferredInstallPrompt()
        if (result.outcome === 'accepted') {
          setStandalone(true)
          toast.success('Web app installed')
          return
        }
      } finally {
        setInstalling(false)
      }
    }
    setShowHelp(true)
  }

  const helpText =
    platform === 'ios'
      ? 'On iPhone: open this page in Safari, tap Share, then Add to Home Screen.'
      : platform === 'android'
        ? 'On Android: open the browser menu and tap Install app or Add to Home screen.'
        : 'On a computer: use the browser menu and choose Install app. On a phone, open this same link and use Safari or Chrome.'

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-stone-400">Download the app</h2>

        <a
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 hover:border-yellow-400/40 hover:bg-white/[0.07] transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/store/app-store.svg" alt="" width={135} height={45} className="h-11 w-auto shrink-0" />
          <div className="min-w-0 text-left">
            <p className="font-semibold text-white">App Store</p>
            <p className="text-sm text-stone-400">iPhone and iPad</p>
          </div>
        </a>

        <a
          href={PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 hover:border-yellow-400/40 hover:bg-white/[0.07] transition-colors"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/store/google-play.svg" alt="" width={152} height={45} className="h-11 w-auto shrink-0" />
          <div className="min-w-0 text-left">
            <p className="font-semibold text-white">Google Play</p>
            <p className="text-sm text-stone-400">Android phones</p>
          </div>
        </a>

        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-[135px] shrink-0 items-center justify-center rounded-lg border border-white/15 bg-zinc-900 text-xs font-bold uppercase tracking-wide text-yellow-400">
              Web app
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-white">Add to home screen</p>
              <p className="text-sm text-stone-400">
                {standalone
                  ? 'This device already has the web app installed.'
                  : 'Works in Safari and Chrome — no store required.'}
              </p>
              {!standalone && (
                <button
                  type="button"
                  onClick={handleWebInstall}
                  disabled={installing}
                  className="mt-3 rounded-xl bg-yellow-400 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-yellow-300 disabled:opacity-60"
                >
                  {installing ? 'Opening…' : 'Install web app'}
                </button>
              )}
              {showHelp && !standalone && (
                <p className="mt-3 text-sm text-stone-300">{helpText}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/5 px-5 py-6">
        <h2 className="text-center text-xl font-bold text-white">Get email updates</h2>
        <p className="mx-auto mt-2 max-w-sm text-center text-sm text-stone-400">
          Upcoming shows and community news. No account needed.
        </p>
        <div className="mt-5">
          <EmailUpdatesSubscribe buttonLabel="Subscribe" />
        </div>
      </section>
    </div>
  )
}
