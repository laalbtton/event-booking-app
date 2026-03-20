'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NavigationTabs from '@/components/NavigationTabs'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useTheme } from 'next-themes'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { SettingsSkeleton } from '@/components/skeletons/SettingsSkeleton'
import { getPushClientState, subscribeCurrentUserToPush, unsubscribeCurrentUserFromPush } from '@/lib/pushClient'
import {
  getInstallPlatform,
  hasDeferredInstallPrompt,
  initInstallPromptCapture,
  isStandaloneMode,
  subscribeToInstallPromptChanges,
  triggerDeferredInstallPrompt,
  type InstallPlatform,
} from '@/lib/installPromptClient'
import { ChevronLeft, Download, LogOut, Settings2, Moon, Bell, HelpCircle, Instagram, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { signOutAndCleanup } from '@/lib/authClient'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { SettingsListRow } from '@/components/SettingsListRow'

type PushNotificationPrefs = {
  user_id: string
  preprompt_dismissed_at: string | null
  preprompt_dismissed_until: string | null
  native_permission_denied_at: string | null
  subscribed_at: string | null
  booking_updates_enabled?: boolean
  event_reminders_enabled?: boolean
  new_events_enabled?: boolean
}

type ThursdaySocapScenario = 'registration_open' | 'seventy_five_full'

export default function SettingsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [pushPrefs, setPushPrefs] = useState<PushNotificationPrefs | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushActionLoading, setPushActionLoading] = useState(false)
  const [instagramConnected, setInstagramConnected] = useState(false)
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null)
  const [globalAutoPostEnabled, setGlobalAutoPostEnabled] = useState(false)
  const [autopostLoading, setAutopostLoading] = useState(false)
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [installActionLoading, setInstallActionLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [socapTestEventId, setSocapTestEventId] = useState('')
  const [socapScenario, setSocapScenario] = useState<ThursdaySocapScenario>('registration_open')
  const [socapTestLoading, setSocapTestLoading] = useState(false)
  const [themeMounted, setThemeMounted] = useState(false)
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    setThemeMounted(true)
  }, [])

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }
    void loadSettings(user.id)
  }, [authResolved, user, router])

  useEffect(() => {
    const state = getPushClientState()
    setPushSupported(state.supported)
    setPushPermission(state.permission)
  }, [])

  useEffect(() => {
    initInstallPromptCapture()
    setInstallPlatform(getInstallPlatform())
    setInstallPromptAvailable(hasDeferredInstallPrompt())
    setIsStandalone(isStandaloneMode())

    const unsubscribe = subscribeToInstallPromptChanges(() => {
      setInstallPromptAvailable(hasDeferredInstallPrompt())
      setIsStandalone(isStandaloneMode())
    })

    return () => {
      unsubscribe()
    }
  }, [])

  async function loadSettings(userId: string) {
    setLoading(true)
    try {
      // Profile must load first to determine isAdminByRole
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (profileError) throw profileError
      setProfile(profileData)

      // All four remaining queries are independent — run in parallel
      const [adminResult, pushPrefsResult, socialResult, prefResult] = await Promise.all([
        supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
        supabase
          .from('push_notification_prefs')
          .select('user_id, preprompt_dismissed_at, preprompt_dismissed_until, native_permission_denied_at, subscribed_at, booking_updates_enabled, event_reminders_enabled, new_events_enabled')
          .eq('user_id', userId)
          .maybeSingle(),
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

      setIsAdmin((profileData?.role === 'admin') || !!adminResult.data)
      setPushPrefs((pushPrefsResult.data || null) as PushNotificationPrefs | null)
      const social = socialResult.data?.[0]
      setInstagramConnected(!!social)
      setInstagramUsername(social?.account_username || null)
      setGlobalAutoPostEnabled(!!prefResult.data?.[0]?.auto_post_enabled)
    } catch (error: any) {
      toast.error(error?.message || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleEnablePushNotifications() {
    if (!profile) return
    setPushActionLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const result = await subscribeCurrentUserToPush(token)
      const nowIso = new Date().toISOString()
      setPushPermission(result.permission)

      if (result.permission === 'denied') {
        await supabase.from('push_notification_prefs').upsert(
          {
            user_id: profile.id,
            native_permission_denied_at: nowIso,
            updated_at: nowIso,
            booking_updates_enabled: pushPrefs?.booking_updates_enabled ?? true,
            event_reminders_enabled: pushPrefs?.event_reminders_enabled ?? true,
            new_events_enabled: pushPrefs?.new_events_enabled ?? true,
          },
          { onConflict: 'user_id' }
        )
        setPushPrefs((prev) => ({
          user_id: profile.id,
          preprompt_dismissed_at: prev?.preprompt_dismissed_at || null,
          preprompt_dismissed_until: prev?.preprompt_dismissed_until || null,
          native_permission_denied_at: nowIso,
          subscribed_at: prev?.subscribed_at || null,
          booking_updates_enabled: prev?.booking_updates_enabled ?? true,
          event_reminders_enabled: prev?.event_reminders_enabled ?? true,
          new_events_enabled: prev?.new_events_enabled ?? true,
        }))
        toast.info('Notifications are blocked in browser settings for this app.')
        return
      }

      if (result.subscribed) {
        await supabase.from('push_notification_prefs').upsert(
          {
            user_id: profile.id,
            subscribed_at: nowIso,
            preprompt_dismissed_at: null,
            preprompt_dismissed_until: null,
            native_permission_denied_at: null,
            booking_updates_enabled: pushPrefs?.booking_updates_enabled ?? true,
            event_reminders_enabled: pushPrefs?.event_reminders_enabled ?? true,
            new_events_enabled: pushPrefs?.new_events_enabled ?? true,
            updated_at: nowIso,
          },
          { onConflict: 'user_id' }
        )
        setPushPrefs({
          user_id: profile.id,
          preprompt_dismissed_at: null,
          preprompt_dismissed_until: null,
          native_permission_denied_at: null,
          subscribed_at: nowIso,
          booking_updates_enabled: pushPrefs?.booking_updates_enabled ?? true,
          event_reminders_enabled: pushPrefs?.event_reminders_enabled ?? true,
          new_events_enabled: pushPrefs?.new_events_enabled ?? true,
        })
        toast.success('Push notifications enabled')
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to enable push notifications')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function handleDisablePushNotifications() {
    if (!profile) return
    setPushActionLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      await unsubscribeCurrentUserFromPush(token)
      const nowIso = new Date().toISOString()
      await supabase.from('push_notification_prefs').upsert(
        {
          user_id: profile.id,
          subscribed_at: null,
          booking_updates_enabled: pushPrefs?.booking_updates_enabled ?? true,
          event_reminders_enabled: pushPrefs?.event_reminders_enabled ?? true,
          new_events_enabled: pushPrefs?.new_events_enabled ?? true,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      )

      setPushPrefs((prev) => ({
        user_id: profile.id,
        preprompt_dismissed_at: prev?.preprompt_dismissed_at || null,
        preprompt_dismissed_until: prev?.preprompt_dismissed_until || null,
        native_permission_denied_at: prev?.native_permission_denied_at || null,
        subscribed_at: null,
        booking_updates_enabled: prev?.booking_updates_enabled ?? true,
        event_reminders_enabled: prev?.event_reminders_enabled ?? true,
        new_events_enabled: prev?.new_events_enabled ?? true,
      }))
      toast.success('Push notifications disabled')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to disable push notifications')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function handleConnectInstagram() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/connect?redirect=/settings', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.connectUrl) throw new Error(result.error || 'Failed to start OAuth')
      window.location.href = result.connectUrl
    } catch (error: any) {
      toast.error(error?.message || 'Could not connect Instagram')
    }
  }

  async function updatePushCategory(
    category: 'booking_updates_enabled' | 'event_reminders_enabled' | 'new_events_enabled',
    enabled: boolean
  ) {
    if (!profile) return
    setPushActionLoading(true)
    try {
      const next = {
        user_id: profile.id,
        booking_updates_enabled: pushPrefs?.booking_updates_enabled ?? true,
        event_reminders_enabled: pushPrefs?.event_reminders_enabled ?? true,
        new_events_enabled: pushPrefs?.new_events_enabled ?? true,
        [category]: enabled,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('push_notification_prefs')
        .upsert(next, { onConflict: 'user_id' })
      if (error) throw error

      setPushPrefs((prev) => ({
        user_id: profile.id,
        preprompt_dismissed_at: prev?.preprompt_dismissed_at || null,
        preprompt_dismissed_until: prev?.preprompt_dismissed_until || null,
        native_permission_denied_at: prev?.native_permission_denied_at || null,
        subscribed_at: prev?.subscribed_at || null,
        booking_updates_enabled: category === 'booking_updates_enabled' ? enabled : (prev?.booking_updates_enabled ?? true),
        event_reminders_enabled: category === 'event_reminders_enabled' ? enabled : (prev?.event_reminders_enabled ?? true),
        new_events_enabled: category === 'new_events_enabled' ? enabled : (prev?.new_events_enabled ?? true),
      }))
      toast.success('Notification category updated')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update notification category')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function handleDisconnectInstagram() {
    if (!profile) return
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
      await loadSettings(profile.id)
    } catch (error: any) {
      toast.error(error?.message || 'Could not disconnect Instagram')
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
    } catch (error: any) {
      toast.error(error?.message || 'Could not update auto-post setting')
    } finally {
      setAutopostLoading(false)
    }
  }

  async function handleInstallFromSettings() {
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

  async function runThursdaySocapPushTest(mode: 'dry_run' | 'self_push' | 'broadcast') {
    if (!socapTestEventId.trim()) {
      toast.error('Please enter an event ID first')
      return
    }

    try {
      setSocapTestLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const payload = {
        eventId: socapTestEventId.trim(),
        scenario: socapScenario,
        dryRun: mode === 'dry_run',
        broadcast: mode === 'broadcast',
        markAsSent: false,
      }

      const response = await fetch('/api/push/test-thursday-socap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Push test failed')

      if (mode === 'dry_run') {
        const checks = result?.checks || {}
        toast.success(
          result?.qualifies
            ? 'Dry run passed. Event meets Thursday + SoCap + scenario checks.'
            : `Dry run failed. Thursday=${checks.passesThursday ? 'yes' : 'no'}, SoCap=${checks.passesSocap ? 'yes' : 'no'}.`
        )
        return
      }

      if (mode === 'self_push') {
        toast.success('Test push sent to your account')
        return
      }

      toast.success('Broadcast push sent to all subscribed users')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to run Thursday SoCap push test'
      toast.error(message)
    } finally {
      setSocapTestLoading(false)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <SettingsSkeleton />
        </div>
        <NavigationTabs />
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <NavigationTabs />
        <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 mb-6">
            <Link href="/profile" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to profile">
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <Card className="shadow-sm overflow-hidden">
            <CardContent className="p-0 divide-y divide-border">
              <div className="px-4 pt-2 pb-1">
                <SettingsListRow href="/settings/appearance" icon={Moon} title="Appearance" description="Dark mode" />
              </div>
              <div className="px-4 py-1">
                <SettingsListRow href="/settings/notifications" icon={Bell} title="Push Notifications" description="Waitlist, reminders, new events" />
              </div>
              {!isStandalone && (
                <div className="px-4 py-1">
                  <SettingsListRow href="/settings/install" icon={Download} title="Add to Home Screen" description="Install as app" />
                </div>
              )}
              <div className="px-4 py-1">
                <SettingsListRow href="/settings/faq" icon={HelpCircle} title="FAQ" description="Credits and events" />
              </div>
              <div className="px-4 py-1">
                <SettingsListRow href="/settings/instagram" icon={Instagram} title="Instagram & Poster Auto-Post" description={instagramConnected ? (instagramUsername ? `@${instagramUsername}` : 'connected') : 'Connect account'} />
              </div>
              <div className="px-4 py-1">
                <SettingsListRow href="/settings/communities" icon={Users} title="Communities" description="Your communities & memberships" />
              </div>
              {isAdmin && (
                <div className="px-4 py-1">
                  <SettingsListRow href="/admin" icon={Settings2} title="Admin" description="Manage users, events, requests" />
                </div>
              )}
              <div className="px-4 py-1 pb-2">
                <SettingsListRow href="/settings/account" icon={User} title="Account" description="Sign out" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <NavigationTabs />
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/profile" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to profile">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </div>
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Appearance</CardTitle>
            <CardDescription>Use dark backgrounds and light text across the app.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Dark mode</p>
                <p className="text-xs text-muted-foreground">Switch to dark theme for the entire app.</p>
              </div>
              {themeMounted && (
                <Switch
                  checked={theme === 'dark'}
                  onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
                />
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Push Notifications</CardTitle>
            <CardDescription>Get waitlist promotions, booking updates, and reminders.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Status:{' '}
              {!pushSupported
                ? 'Not supported on this browser/device'
                : pushPermission === 'granted'
                ? 'Enabled'
                : pushPermission === 'denied'
                ? 'Blocked by browser settings'
                : 'Not enabled'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleEnablePushNotifications}
                disabled={!pushSupported || pushActionLoading || pushPermission === 'granted'}
              >
                {pushActionLoading ? 'Please wait...' : 'Enable Notifications'}
              </Button>
              <Button
                variant="outline"
                onClick={handleDisablePushNotifications}
                disabled={!pushSupported || pushActionLoading || !pushPrefs?.subscribed_at}
              >
                Disable Notifications
              </Button>
            </div>
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium">Notification categories</p>
              <div className="flex items-center justify-between text-sm">
                <span>Booking updates (waitlist/promotions)</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pushPrefs?.booking_updates_enabled !== false}
                  onChange={(e) => updatePushCategory('booking_updates_enabled', e.target.checked)}
                  disabled={pushActionLoading}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Event reminders</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pushPrefs?.event_reminders_enabled !== false}
                  onChange={(e) => updatePushCategory('event_reminders_enabled', e.target.checked)}
                  disabled={pushActionLoading}
                />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>New events / registration opening</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pushPrefs?.new_events_enabled !== false}
                  onChange={(e) => updatePushCategory('new_events_enabled', e.target.checked)}
                  disabled={pushActionLoading}
                />
              </div>
            </div>
            {pushPermission === 'denied' && (
              <p className="text-xs text-muted-foreground">
                Notifications were denied by the browser. To re-enable, allow notifications in browser/site settings.
              </p>
            )}

            {(profile?.role === 'admin' || profile?.role === 'event_creator') && (
              <div className="space-y-3 pt-3 border-t">
                <p className="text-sm font-medium">Thursday SoCap push test tools</p>
                <p className="text-xs text-muted-foreground">
                  For testing the global Thursday+SoCap automation. Start with dry run, then send to yourself.
                </p>
                <Input
                  placeholder="Event ID to test"
                  value={socapTestEventId}
                  onChange={(e) => setSocapTestEventId(e.target.value)}
                />
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={socapScenario}
                  onChange={(e) => setSocapScenario(e.target.value as ThursdaySocapScenario)}
                >
                  <option value="registration_open">Registration open scenario</option>
                  <option value="seventy_five_full">75% full scenario</option>
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => runThursdaySocapPushTest('dry_run')}
                    disabled={socapTestLoading}
                  >
                    {socapTestLoading ? 'Running...' : 'Run Dry Test'}
                  </Button>
                  <Button
                    type="button"
                    onClick={() => runThursdaySocapPushTest('self_push')}
                    disabled={socapTestLoading}
                  >
                    Send Test To Me
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => runThursdaySocapPushTest('broadcast')}
                    disabled={socapTestLoading}
                  >
                    Broadcast To All
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {!isStandalone && (
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
              <Button onClick={handleInstallFromSettings} disabled={installActionLoading}>
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
        )}

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">FAQ</CardTitle>
            <CardDescription>Frequently asked questions about credits and events.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium">Redeemable Credits</p>
              <p className="text-sm text-muted-foreground mt-1">
                Attend events free with Redeemable Credits.{' '}
                <Link href="/redeemable-credits" className="underline underline-offset-2 font-medium text-foreground">
                  How this works
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Instagram & Poster Auto-Post</CardTitle>
            <CardDescription>Connect Instagram and control poster auto-post behavior.</CardDescription>
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

            <Badge variant="outline" className="w-fit">Moved from profile</Badge>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <Users className="h-5 w-5" />
              Communities
            </CardTitle>
            <CardDescription>Browse and manage your community memberships.</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/communities">My Communities</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/communities">Browse All</Link>
            </Button>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card className="shadow-sm border-purple-200">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-purple-600" />
                Admin
              </CardTitle>
              <CardDescription>Access the admin panel to manage users, events, and requests.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                <Link href="/admin">
                  Open Admin Panel
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl">Account</CardTitle>
            <CardDescription>Sign out of your account on this device.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={async () => { await signOutAndCleanup(); router.push('/') }}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
