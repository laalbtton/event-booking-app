'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { getPushClientState, subscribeCurrentUserToPush, unsubscribeCurrentUserFromPush } from '@/lib/pushClient'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'

type PushNotificationPrefs = {
  user_id: string
  preprompt_dismissed_at: string | null
  preprompt_dismissed_until: string | null
  native_permission_denied_at: string | null
  subscribed_at: string | null
  booking_updates_enabled?: boolean
  event_reminders_enabled?: boolean
  new_events_enabled?: boolean
  post_event_reviews_enabled?: boolean
}

type ThursdaySocapScenario = 'registration_open' | 'seventy_five_full'

export default function SettingsNotificationsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [pushPrefs, setPushPrefs] = useState<PushNotificationPrefs | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushActionLoading, setPushActionLoading] = useState(false)
  const [socapTestEventId, setSocapTestEventId] = useState('')
  const [socapScenario, setSocapScenario] = useState<ThursdaySocapScenario>('registration_open')
  const [socapTestLoading, setSocapTestLoading] = useState(false)

  type TestPushResult = {
    success: boolean
    sent: number
    failed: number
    subscriptions: Array<{ id: string; platform: string; isActive: boolean; hasToken: boolean; hasEndpoint: boolean }>
    firebaseEnvConfigured: boolean
    error?: string
  }
  const [testPushLoading, setTestPushLoading] = useState(false)
  const [testPushResult, setTestPushResult] = useState<TestPushResult | null>(null)
  const [testPushMessage, setTestPushMessage] = useState('')

  useEffect(() => {
    async function checkPushSupport() {
      // On native Capacitor the web PushManager API doesn't exist, so we
      // detect native first and ask the plugin for current permission state.
      let isNative = false
      try {
        const { Capacitor } = await import('@capacitor/core')
        isNative = Capacitor.isNativePlatform()
      } catch { /* not native */ }

      if (isNative) {
        setPushSupported(true)
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          const { receive } = await PushNotifications.checkPermissions()
          if (receive === 'granted') setPushPermission('granted')
          else if (receive === 'denied') setPushPermission('denied')
          else setPushPermission('default')
        } catch {
          setPushPermission('default')
        }
        return
      }

      // Web fallback — check PWA push support
      const state = getPushClientState()
      setPushSupported(state.supported)
      setPushPermission(state.permission)
    }
    checkPushSupport()
  }, [])

  useEffect(() => {
    if (!authResolved || !user) return
    void loadData(user.id)
  }, [authResolved, user])

  async function loadData(userId: string) {
    setLoading(true)
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile(profileData || null)

      const { data: pushPrefsData } = await supabase
        .from('push_notification_prefs')
        .select('user_id, preprompt_dismissed_at, preprompt_dismissed_until, native_permission_denied_at, subscribed_at, booking_updates_enabled, event_reminders_enabled, new_events_enabled, post_event_reviews_enabled')
        .eq('user_id', userId)
        .maybeSingle()
      setPushPrefs((pushPrefsData || null) as PushNotificationPrefs | null)
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to load')
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
            post_event_reviews_enabled: pushPrefs?.post_event_reviews_enabled ?? true,
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
          post_event_reviews_enabled: prev?.post_event_reviews_enabled ?? true,
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
            post_event_reviews_enabled: pushPrefs?.post_event_reviews_enabled ?? true,
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
          post_event_reviews_enabled: pushPrefs?.post_event_reviews_enabled ?? true,
        })
        toast.success('Push notifications enabled')
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to enable push notifications')
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
          post_event_reviews_enabled: pushPrefs?.post_event_reviews_enabled ?? true,
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
        post_event_reviews_enabled: prev?.post_event_reviews_enabled ?? true,
      }))
      toast.success('Push notifications disabled')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to disable push notifications')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function updatePushCategory(
    category:
      | 'booking_updates_enabled'
      | 'event_reminders_enabled'
      | 'new_events_enabled'
      | 'post_event_reviews_enabled',
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
        post_event_reviews_enabled: pushPrefs?.post_event_reviews_enabled ?? true,
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
        post_event_reviews_enabled: category === 'post_event_reviews_enabled' ? enabled : (prev?.post_event_reviews_enabled ?? true),
      }))
      toast.success('Notification category updated')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to update notification category')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function sendTestPush() {
    setTestPushLoading(true)
    setTestPushResult(null)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const customMsg = testPushMessage.trim()
      const res = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: 'Test notification',
          body: customMsg || 'Push notifications are working on your device! 🎉',
          url: '/dashboard',
        }),
      })
      const data = await res.json().catch(() => ({}))
      setTestPushResult(data as TestPushResult)

      if (!res.ok || data.error) {
        toast.error(data.error || 'Test push failed')
      } else if ((data.sent ?? 0) > 0) {
        toast.success(`Test push sent! You should hear a sound and see a notification.`)
      } else {
        toast.info('Push was processed but nothing was sent — check the diagnostics below.')
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Test push failed')
    } finally {
      setTestPushLoading(false)
    }
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
          <h1 className="text-2xl font-bold">Push Notifications</h1>
        </div>
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
                ? 'Blocked — enable in device Settings → Apps → Laal Button → Notifications'
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
              <div className="flex items-center justify-between text-sm">
                <span>Post-event ratings prompt</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={pushPrefs?.post_event_reviews_enabled !== false}
                  onChange={(e) => updatePushCategory('post_event_reviews_enabled', e.target.checked)}
                  disabled={pushActionLoading}
                />
              </div>
            </div>
            {pushPermission === 'denied' && (
              <p className="text-xs text-muted-foreground">
                Notifications were denied. To re-enable, go to your device Settings → Apps → Laal Button → Notifications and turn them on.
              </p>
            )}

            {/* ── Test push ──────────────────────────────────────────────── */}
            <div className="space-y-3 pt-3 border-t">
              <p className="text-sm font-medium">Test device notifications</p>
              <p className="text-xs text-muted-foreground">
                Sends a real notification to this device right now — bypasses all category preferences. You should see it in the status bar and hear a sound.
              </p>
              <Input
                placeholder="Optional: custom message to display in the notification"
                value={testPushMessage}
                onChange={(e) => setTestPushMessage(e.target.value)}
                maxLength={200}
              />
              <Button
                type="button"
                variant="outline"
                onClick={sendTestPush}
                disabled={testPushLoading}
                className="w-full sm:w-auto"
              >
                {testPushLoading ? 'Sending…' : 'Send test notification to this device'}
              </Button>

              {testPushResult && (
                <div className={`rounded-lg border px-4 py-3 text-sm space-y-2 ${testPushResult.success ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                  {testPushResult.error ? (
                    <p className="font-medium text-red-600 dark:text-red-400">{testPushResult.error}</p>
                  ) : (
                    <p className={`font-medium ${testPushResult.success ? 'text-green-700 dark:text-green-400' : 'text-yellow-700 dark:text-yellow-400'}`}>
                      {testPushResult.success
                        ? `Sent ${testPushResult.sent} notification${testPushResult.sent !== 1 ? 's' : ''} — check your status bar`
                        : `Processed but 0 sent (${testPushResult.failed} failed)`}
                    </p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    Firebase env vars:{' '}
                    <span className={testPushResult.firebaseEnvConfigured ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                      {testPushResult.firebaseEnvConfigured ? 'configured ✓' : 'missing — add FIREBASE_PROJECT_ID / CLIENT_EMAIL / PRIVATE_KEY to Vercel env'}
                    </span>
                  </p>

                  {testPushResult.subscriptions.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Subscriptions found:</p>
                      {testPushResult.subscriptions.map((s) => (
                        <div key={s.id} className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-mono ${s.platform === 'android' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-blue-500/15 text-blue-700 dark:text-blue-400'}`}>
                            {s.platform}
                          </span>
                          <span className={s.isActive ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground line-through'}>
                            {s.isActive ? 'active' : 'inactive'}
                          </span>
                          {s.platform === 'android' && (
                            <span className={s.hasToken ? 'text-green-600 dark:text-green-400' : 'text-red-500'}>
                              FCM token: {s.hasToken ? 'present ✓' : 'missing ✗'}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {testPushResult.subscriptions.length === 0 && (
                    <p className="text-xs text-red-500">
                      No subscriptions in database. Open the app on your Android device and enable notifications first.
                    </p>
                  )}
                </div>
              )}
            </div>

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
      </div>
    </div>
  )
}
