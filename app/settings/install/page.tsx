'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  getInstallPlatform,
  hasDeferredInstallPrompt,
  initInstallPromptCapture,
  isStandaloneMode,
  subscribeToInstallPromptChanges,
  triggerDeferredInstallPrompt,
  type InstallPlatform,
} from '@/lib/installPromptClient'

export default function SettingsInstallPage() {
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [installActionLoading, setInstallActionLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    initInstallPromptCapture()
    setInstallPlatform(getInstallPlatform())
    setInstallPromptAvailable(hasDeferredInstallPrompt())
    setIsStandalone(isStandaloneMode())

    const unsubscribe = subscribeToInstallPromptChanges(() => {
      setInstallPromptAvailable(hasDeferredInstallPrompt())
      setIsStandalone(isStandaloneMode())
    })

    return () => unsubscribe()
  }, [])

  async function handleInstall() {
    if (installPlatform === 'android' && installPromptAvailable) {
      setInstallActionLoading(true)
      try {
        const result = await triggerDeferredInstallPrompt()
        if (result.outcome === 'accepted') {
          setIsStandalone(true)
          toast.success('App installed successfully')
          return
        }
      } finally {
        setInstallActionLoading(false)
      }
      return
    }
    setShowInstallHelp((prev) => !prev)
  }

  if (isStandalone) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <NavigationTabs />
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold">Add to Home Screen</h1>
          </div>
          <Card className="shadow-sm border-yellow-400/30">
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">The app is already installed.</p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <NavigationTabs />
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Add to Home Screen</h1>
        </div>
        <Card className="shadow-sm border-yellow-400/30">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Download className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              Add to Home Screen
            </CardTitle>
            <CardDescription>
              Install One Mic Stand to your home screen and get 5 free credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handleInstall} disabled={installActionLoading}>
              {installActionLoading ? 'Opening...' : 'Install App'}
            </Button>
            {showInstallHelp && (
              <p className="text-xs text-muted-foreground">
                {installPlatform === 'ios'
                  ? 'Open Safari Share menu, choose Add to Home Screen, then tap Add.'
                  : 'Open your browser menu and choose Install app or Add to Home screen.'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
