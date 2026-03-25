'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

export default function SettingsInstagramPage() {
  const { authResolved, user } = useAuthBootstrap()
  const [loading, setLoading] = useState(true)
  const [instagramConnected, setInstagramConnected] = useState(false)
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null)
  const [globalAutoPostEnabled, setGlobalAutoPostEnabled] = useState(false)
  const [autopostLoading, setAutopostLoading] = useState(false)
  const [copyInstagramHandlesEnabled, setCopyInstagramHandlesEnabled] = useState(false)

  useEffect(() => {
    if (!authResolved || !user) return
    void loadData(user.id)
  }, [authResolved, user])

  useEffect(() => {
    // This preference is intentionally stored on-device. Default is OFF.
    const key = 'copy_instagram_handles_enabled'
    const val = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null
    setCopyInstagramHandlesEnabled(val === '1')
  }, [])

  async function loadData(userId: string) {
    setLoading(true)
    try {
      // Both queries only need userId — run in parallel
      const [socialResult, prefResult] = await Promise.all([
        supabase
          .from('social_accounts')
          .select('account_username, is_active')
          .eq('user_id', userId)
          .eq('provider', 'instagram')
          .eq('is_active', true)
          .limit(1),
        supabase
          .from('poster_auto_post_prefs')
          .select('auto_post_enabled')
          .eq('user_id', userId)
          .is('event_id', null)
          .limit(1),
      ])
      const social = socialResult.data?.[0]
      setInstagramConnected(!!social)
      setInstagramUsername(social?.account_username || null)
      setGlobalAutoPostEnabled(!!prefResult.data?.[0]?.auto_post_enabled)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectInstagram() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/connect?redirect=/settings/instagram', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.connectUrl) throw new Error(result.error || 'Failed to start OAuth')
      window.location.href = result.connectUrl
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not connect Instagram')
    }
  }

  async function handleDisconnectInstagram() {
    if (!user) return
    try {
      setAutopostLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/disconnect', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to disconnect')
      await loadData(user.id)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not disconnect Instagram')
    } finally {
      setAutopostLoading(false)
    }
  }

  async function updateGlobalAutoPost(enabled: boolean) {
    try {
      setAutopostLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/poster-autopost/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId: null, enabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to update preference')
      setGlobalAutoPostEnabled(enabled)
      toast.success('Instagram auto-post preference updated')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Could not update auto-post setting')
    } finally {
      setAutopostLoading(false)
    }
  }

  function updateCopyInstagramHandlesEnabled(enabled: boolean) {
    setCopyInstagramHandlesEnabled(enabled)
    window.localStorage.setItem('copy_instagram_handles_enabled', enabled ? '1' : '0')
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
<div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Settings">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Instagram, Auto-Post & Event Handle Copy</h1>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Instagram, Auto-Post & Event Handle Copy</CardTitle>
            <CardDescription>Connect Instagram, control poster auto-post, and show/hide Instagram handle copy on event pages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">
                  Instagram {instagramConnected ? `connected${instagramUsername ? ` as @${instagramUsername}` : ''}` : 'not connected'}
                </p>
                <p className="text-xs text-muted-foreground">Only Instagram Business/Creator accounts are supported.</p>
              </div>
              {instagramConnected ? (
                <Button variant="outline" onClick={handleDisconnectInstagram} disabled={autopostLoading}>
                  Disconnect
                </Button>
              ) : (
                <Button onClick={handleConnectInstagram} disabled={autopostLoading}>
                  Connect Instagram
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Enable auto-post by default</p>
                <p className="text-xs text-muted-foreground">Applied to new event posters unless overridden per event.</p>
              </div>
              <input
                type="checkbox"
                checked={globalAutoPostEnabled}
                disabled={!instagramConnected || autopostLoading}
                onChange={(e) => updateGlobalAutoPost(e.target.checked)}
                className="h-4 w-4"
              />
            </div>

            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <p className="text-sm font-medium">Show Instagram handle copy on event pages</p>
                <p className="text-xs text-muted-foreground">Default is off. Copies @handles for confirmed + waitlisted performers.</p>
              </div>
              <input
                type="checkbox"
                checked={copyInstagramHandlesEnabled}
                onChange={(e) => updateCopyInstagramHandlesEnabled(e.target.checked)}
                className="h-4 w-4"
              />
            </div>

            <Badge variant="outline" className="w-fit">Moved from profile</Badge>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
