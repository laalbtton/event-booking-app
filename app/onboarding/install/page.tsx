'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getInstallOnboardingSkippedKey,
  getInstallPlatform,
  hasDeferredInstallPrompt,
  initInstallPromptCapture,
  isStandaloneMode,
  subscribeToInstallPromptChanges,
  triggerDeferredInstallPrompt,
  type InstallPlatform,
} from '@/lib/installPromptClient'

export default function InstallOnboardingPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [platform, setPlatform] = useState<InstallPlatform>('other')
  const [promptAvailable, setPromptAvailable] = useState(false)
  const [showManualHelp, setShowManualHelp] = useState(false)

  useEffect(() => {
    initInstallPromptCapture()
    setPlatform(getInstallPlatform())
    setPromptAvailable(hasDeferredInstallPrompt())

    const unsubscribe = subscribeToInstallPromptChanges(() => {
      setPromptAvailable(hasDeferredInstallPrompt())
    })

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace('/login')
        return
      }
      setUserId(user.id)

      if (isStandaloneMode()) {
        router.replace('/dashboard')
        return
      }

      setLoading(false)
    }

    void load()

    return () => {
      unsubscribe()
    }
  }, [router])

  async function handleSkip() {
    if (userId) {
      window.localStorage.setItem(getInstallOnboardingSkippedKey(userId), '1')
    }
    router.replace('/dashboard')
  }

  async function handleInstall() {
    if (platform === 'android' && promptAvailable) {
      setSubmitting(true)
      try {
        const result = await triggerDeferredInstallPrompt()
        if (result.outcome === 'accepted') {
          router.replace('/dashboard')
          return
        }
      } finally {
        setSubmitting(false)
      }
      return
    }

    setShowManualHelp(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-lg">Preparing onboarding...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">One last thing</p>
          <CardTitle className="text-3xl font-bold">Get the Full Experience</CardTitle>
          <CardDescription>
            Install One Mic Stand to your home screen and get 5 free credits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="mx-auto w-52 rounded-3xl border p-3 bg-muted/20">
            <div className="rounded-2xl bg-background p-4 flex items-center justify-center">
              <Image src="/icon-192.png" alt="App icon preview" width={88} height={88} className="rounded-2xl" />
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">One Mic Stand on your home screen</p>
          </div>

          <div className="rounded-md border p-4 space-y-2 text-sm">
            {platform === 'android' ? (
              <>
                <p className="font-medium">Android install</p>
                <p>
                  Tap <strong>Install App</strong> to add One Mic Stand to your home screen in one step.
                </p>
                {!promptAvailable && (
                  <p className="text-muted-foreground">
                    If the install sheet does not appear, open browser menu and choose <strong>Add to Home screen</strong>.
                  </p>
                )}
              </>
            ) : platform === 'ios' ? (
              <>
                <p className="font-medium">iPhone install</p>
                <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
                  <li>Tap the Safari Share icon at the bottom toolbar.</li>
                  <li>Scroll and tap <strong>Add to Home Screen</strong>.</li>
                  <li>Tap <strong>Add</strong>.</li>
                </ol>
              </>
            ) : (
              <>
                <p className="font-medium">Install from your browser menu</p>
                <p className="text-muted-foreground">
                  Look for <strong>Install app</strong> or <strong>Add to Home Screen</strong> in your browser menu.
                </p>
              </>
            )}
          </div>

          {showManualHelp && platform !== 'android' && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              Follow the install steps above, then return to continue.
            </div>
          )}

          <div className="flex gap-2">
            <Button className="flex-1" onClick={handleInstall} disabled={submitting}>
              {submitting ? 'Opening...' : 'Install App'}
            </Button>
            <Button className="flex-1" variant="outline" onClick={handleSkip}>
              Maybe Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

