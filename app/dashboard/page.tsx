'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event, Booking } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
import Link from 'next/link'
import { createNotification } from '@/lib/notifications'
import { sendBookingConfirmationEmail, sendWaitlistPromotionEmail, sendWaitlistPositionEmail } from '@/lib/emailService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { cn } from '@/lib/utils'
import { ChevronDown, Download } from 'lucide-react'
import { toast } from 'sonner'
import { signOutAndCleanup } from '@/lib/authClient'
import { PushPermissionPrePrompt } from '@/components/notifications/push-permission-preprompt'
import { getPushClientState, subscribeCurrentUserToPush } from '@/lib/pushClient'
import {
  getInstallBannerDismissedKey,
  getInstallPlatform,
  hasDeferredInstallPrompt,
  initInstallPromptCapture,
  isStandaloneMode,
  subscribeToInstallPromptChanges,
  triggerDeferredInstallPrompt,
  type InstallPlatform,
} from '@/lib/installPromptClient'

type PushNotificationPrefs = {
  user_id: string
  preprompt_dismissed_at: string | null
  preprompt_dismissed_until: string | null
  native_permission_denied_at: string | null
  last_prompted_at: string | null
  subscribed_at: string | null
  updated_at: string
}

type VarietyArtOption = {
  id: string
  name: string
  capacity: number
  confirmedCount: number
  waitlistCount: number
}

export default function Dashboard() {
  const { confirm } = useConfirmDialog()
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleRequestStatus, setRoleRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
  const [eventTab, setEventTab] = useState<'perform' | 'attend'>('perform')
  const [invitedEventIds, setInvitedEventIds] = useState<Set<string>>(new Set())
  const previousBookingsRef = useRef<any[]>([])
  const [settingAlert, setSettingAlert] = useState<string | null>(null)
  const [alertSet, setAlertSet] = useState<Set<string>>(new Set())
  const [pushPrefs, setPushPrefs] = useState<PushNotificationPrefs | null>(null)
  const [showPushPrePrompt, setShowPushPrePrompt] = useState(false)
  const [pushActionLoading, setPushActionLoading] = useState(false)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [installActionLoading, setInstallActionLoading] = useState(false)
  const [varietyDialogOpen, setVarietyDialogOpen] = useState(false)
  const [varietyDialogEvent, setVarietyDialogEvent] = useState<Event | null>(null)
  const [varietyOptions, setVarietyOptions] = useState<VarietyArtOption[]>([])
  const [selectedVarietyOptionId, setSelectedVarietyOptionId] = useState<string>('')
  const [redeemInfoDialogOpen, setRedeemInfoDialogOpen] = useState(false)
  const router = useRouter()
  const PREPROMPT_SNOOZE_DAYS = 7

  function formatLocationValue(value: unknown): string {
    if (!value) return 'TBD'
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null) {
      const maybeVenue = value as { name?: string; address?: string; pathname?: string }
      if (maybeVenue.name && maybeVenue.address) {
        return `${maybeVenue.name}, ${maybeVenue.address}`
      }
      if (maybeVenue.pathname) {
        return maybeVenue.pathname
      }
    }
    return 'TBD'
  }


  function formatVenueName(value: unknown): string {
    const location = formatLocationValue(value)
    const [name] = location.split(',')
    return name.trim() || location
  }

  function getEffectiveCreditsRequired(event: Event): number {
    if (!event.food_coupon_enabled) return event.credits_required
    const spotFee = Math.max(0, Number(event.spot_fee_credits || 0))
    const couponCredits = Math.ceil(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100)
    return spotFee + couponCredits
  }

  function getEffectiveNoShowPenalty(event: Event): { enabled: boolean; credits: number } {
    const defaultEnabled = Number(event.credits_required || 0) <= 0
    const enabled = event.no_show_penalty_enabled ?? defaultEnabled
    const credits = Math.max(0, Number(event.no_show_penalty_credits ?? 5))
    return { enabled, credits }
  }

  function formatEventLanguages(event: Event): string {
    const langs = Array.isArray((event as any).languages) ? (event as any).languages : ['English']
    const cleaned = langs
      .map((lang: string) => String(lang || '').trim())
      .filter(Boolean)
      .filter((lang: string, idx: number, arr: string[]) => arr.findIndex((l) => l.toLowerCase() === lang.toLowerCase()) === idx)

    const withEnglish = cleaned.some((lang: string) => lang.toLowerCase() === 'english')
      ? cleaned
      : [...cleaned, 'English']
    const nonEnglish = withEnglish.filter((lang: string) => lang.toLowerCase() !== 'english')
    return [...nonEnglish, 'English'].join(', ')
  }

  function getRatingDisplay(rating: string | null | undefined): string {
    const normalized = String(rating || '18+').trim()
    const isAllAges = normalized.toLowerCase().includes('all')
    return `${isAllAges ? '👨‍👩‍👧‍👦' : '🔞'} ${normalized}`
  }

  async function openVarietyPicker(event: Event) {
    const { data: artRows, error: artError } = await supabase
      .from('event_art_types')
      .select('id, art_type_name, slot_capacity')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })

    if (artError) throw new Error(artError.message)
    if (!artRows || artRows.length === 0) {
      throw new Error('This variety event has no configured art type slots.')
    }

    const { data: bookingRows, error: bookingError } = await supabase
      .from('bookings')
      .select('event_art_type_id, status, booking_scope')
      .eq('event_id', event.id)
      .eq('booking_scope', 'performer')
      .in('status', ['confirmed', 'waitlist'])

    if (bookingError) throw new Error(bookingError.message)

    const options = (artRows || []).map((row: any) => {
      const confirmedCount = (bookingRows || []).filter(
        (booking: any) => booking.status === 'confirmed' && booking.event_art_type_id === row.id
      ).length
      const waitlistCount = (bookingRows || []).filter(
        (booking: any) => booking.status === 'waitlist' && booking.event_art_type_id === row.id
      ).length
      return {
        id: row.id,
        name: row.art_type_name,
        capacity: Number(row.slot_capacity || 0),
        confirmedCount,
        waitlistCount,
      } satisfies VarietyArtOption
    })

    setVarietyDialogEvent(event)
    setVarietyOptions(options)
    setSelectedVarietyOptionId(options[0]?.id || '')
    setVarietyDialogOpen(true)
  }

  async function loadPushPrefs(userId: string) {
    const { data, error } = await supabase
      .from('push_notification_prefs')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()

    if (error) {
      console.warn('Failed to load push preferences:', error.message)
      return
    }
    setPushPrefs((data || null) as PushNotificationPrefs | null)
  }

  async function upsertPushPrefs(patch: Partial<PushNotificationPrefs>) {
    if (!profile) return
    const nowIso = new Date().toISOString()
    const payload = {
      user_id: profile.id,
      updated_at: nowIso,
      ...patch,
    }

    const { error } = await supabase
      .from('push_notification_prefs')
      .upsert(payload, { onConflict: 'user_id' })

    if (error) {
      console.warn('Failed to update push preferences:', error.message)
      return
    }

    setPushPrefs((prev) => ({
      user_id: profile.id,
      preprompt_dismissed_at: prev?.preprompt_dismissed_at || null,
      preprompt_dismissed_until: prev?.preprompt_dismissed_until || null,
      native_permission_denied_at: prev?.native_permission_denied_at || null,
      last_prompted_at: prev?.last_prompted_at || null,
      subscribed_at: prev?.subscribed_at || null,
      updated_at: nowIso,
      ...prev,
      ...patch,
    }))
  }

  async function maybeShowPushPrePromptAfterBooking() {
    const pushState = getPushClientState()
    if (!pushState.supported) return

    if (pushState.permission === 'granted') return
    if (pushState.permission === 'denied') {
      if (!pushPrefs?.native_permission_denied_at) {
        await upsertPushPrefs({ native_permission_denied_at: new Date().toISOString() })
      }
      return
    }

    if (pushPrefs?.native_permission_denied_at) return

    if (pushPrefs?.preprompt_dismissed_until) {
      const dismissedUntil = new Date(pushPrefs.preprompt_dismissed_until).getTime()
      if (Date.now() < dismissedUntil) return
    }

    setShowPushPrePrompt(true)
  }

  async function handlePrePromptNotNow() {
    const now = new Date()
    const dismissedUntil = new Date(now.getTime() + PREPROMPT_SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    await upsertPushPrefs({
      preprompt_dismissed_at: now.toISOString(),
      preprompt_dismissed_until: dismissedUntil.toISOString(),
    })
    setShowPushPrePrompt(false)
  }

  async function handleEnablePushFromPrePrompt() {
    if (!profile) return
    setPushActionLoading(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const result = await subscribeCurrentUserToPush(token)
      const nowIso = new Date().toISOString()

      if (result.permission === 'denied') {
        await upsertPushPrefs({
          native_permission_denied_at: nowIso,
          last_prompted_at: nowIso,
        })
        toast.info('Notifications are blocked in browser settings.')
        setShowPushPrePrompt(false)
        return
      }

      if (result.subscribed) {
        await upsertPushPrefs({
          last_prompted_at: nowIso,
          subscribed_at: nowIso,
          native_permission_denied_at: null,
          preprompt_dismissed_at: null,
          preprompt_dismissed_until: null,
        })
        setShowPushPrePrompt(false)
        toast.success('Push notifications enabled')

        await fetch('/api/push/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            title: 'Notifications are on',
            body: 'You will receive key booking and reminder updates.',
            url: '/dashboard',
          }),
        })
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to enable notifications')
    } finally {
      setPushActionLoading(false)
    }
  }

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }
    if (user.user_metadata?.onboarding_role_pending) {
      setLoading(false)
      router.push('/onboarding/role')
      return
    }
    setLoading(true)
    void checkAuth(user.id)
  }, [authResolved, user, router])

  useEffect(() => {
    if (userRole === 'audience') {
      setEventTab('attend')
    }
  }, [userRole])

  useEffect(() => {
    if (!authResolved || !user) return

    initInstallPromptCapture()
    setInstallPlatform(getInstallPlatform())
    setInstallPromptAvailable(hasDeferredInstallPrompt())

    const standalone = isStandaloneMode()
    const dismissed = window.localStorage.getItem(getInstallBannerDismissedKey(user.id)) === '1'
    setShowInstallBanner(!standalone && !dismissed)

    const unsubscribe = subscribeToInstallPromptChanges(() => {
      setInstallPromptAvailable(hasDeferredInstallPrompt())
    })

    return () => {
      unsubscribe()
    }
  }, [authResolved, user])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // Set up real-time subscription for booking changes
  useEffect(() => {
    if (!profile) return

    // Subscribe to changes in bookings table for this user
    const channel = supabase
      .channel('bookings-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings',
          filter: `user_id=eq.${profile.id}`
        },
        async (payload) => {
          const updatedBooking = payload.new as any
          const oldBooking = payload.old as any
          
          if (!profile) return
          
          // Check if this booking was waitlist before by checking local state
          // payload.old might only contain ID, so we check our local bookings
          const previousBooking = myBookings.find(b => b.id === updatedBooking.id)
          const wasWaitlist = previousBooking?.status === 'waitlist'
          const isNowConfirmed = updatedBooking.status === 'confirmed'
          
          // Check if status changed from waitlist to confirmed (PRIORITY: Handle promotion first)
          // We check both: oldBooking.status (if available) OR our local state
          if (isNowConfirmed && (oldBooking.status === 'waitlist' || wasWaitlist)) {
            console.log('Waitlist promotion detected via real-time:', {
              bookingId: updatedBooking.id,
              eventId: updatedBooking.event_id,
              userId: profile.id,
              oldStatus: oldBooking.status || previousBooking?.status,
              newStatus: updatedBooking.status
            })
            
            // Create notification for waitlist promotion
            try {
              await createNotification(
                profile.id,
                'waitlist_promoted',
                'Promoted to Confirmed! 🎉',
                'Congratulations! You\'ve been promoted from the waitlist to confirmed!',
                updatedBooking.id,
                updatedBooking.event_id
              )
              console.log('Notification created for waitlist promotion')
            } catch (notifError) {
              console.error('Failed to create waitlist promotion notification:', notifError)
            }

            try {
              const { data: sessionData } = await supabase.auth.getSession()
              const token = sessionData.session?.access_token
              if (token) {
                await fetch('/api/push/notify-self', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                  },
                  body: JSON.stringify({
                    type: 'waitlist_promoted',
                    url: '/dashboard',
                  }),
                })
              }
            } catch (pushError) {
              console.warn('Failed to send waitlist promoted push notification:', pushError)
            }
            
            // Send waitlist promotion email (non-blocking)
            try {
              await sendWaitlistPromotionEmail(profile.id, updatedBooking.event_id)
              console.log('Waitlist promotion email sent')
            } catch (emailError) {
              console.warn('Failed to send waitlist promotion email:', emailError)
            }
          }
          
          // Check if waitlist position changed (only if still on waitlist)
          // Use local state to get old position if payload.old doesn't have it
          const oldPosition = oldBooking.waitlist_position !== undefined 
            ? oldBooking.waitlist_position 
            : previousBooking?.waitlist_position
          
          if (updatedBooking.status === 'waitlist' && oldPosition !== updatedBooking.waitlist_position) {
            if (updatedBooking.waitlist_position === null && oldPosition !== null) {
              // Position was cleared - might have been promoted (but status check above should catch this)
              await createNotification(
                profile.id,
                'waitlist_position_changed',
                'Waitlist Position Updated',
                'Your waitlist position has been updated.',
                updatedBooking.id,
                updatedBooking.event_id
              )
            } else if (updatedBooking.waitlist_position !== null) {
              const newPos = updatedBooking.waitlist_position
              const oldPos = oldPosition
              
              if (oldPos !== null && newPos < oldPos) {
                // Position improved
                await createNotification(
                  profile.id,
                  'waitlist_position_improved',
                  'Waitlist Position Improved! 🎉',
                  `Great news! Your waitlist position improved from #${oldPos} to #${newPos}`,
                  updatedBooking.id,
                  updatedBooking.event_id
                )
                
                // Send email if position improved significantly (moved up by 3+ positions)
                if (oldPos - newPos >= 3) {
                  sendWaitlistPositionEmail(
                    profile.id,
                    updatedBooking.event_id,
                    newPos,
                    oldPos
                  ).catch(err => {
                    console.warn('Failed to send waitlist position email:', err)
                  })
                }
              } else if (oldPos !== null && newPos > oldPos) {
                // Position got worse (shouldn't happen, but handle it)
                await createNotification(
                  profile.id,
                  'waitlist_position_changed',
                  'Waitlist Position Changed',
                  `Your waitlist position changed to #${newPos}`,
                  updatedBooking.id,
                  updatedBooking.event_id
                )
              } else if (oldPos === null) {
                // New position assigned
                await createNotification(
                  profile.id,
                  'waitlist_position_changed',
                  'Added to Waitlist',
                  `You are now #${newPos} on the waitlist`,
                  updatedBooking.id,
                  updatedBooking.event_id
                )
              }
            }
          }
          
          // Reload data to reflect changes
          if (profile) {
            loadData(profile.id)
          }
        }
      )
      // Also listen to ALL booking changes (INSERT, UPDATE, DELETE) to update event capacity
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'bookings'
        },
        async (payload) => {
          // When a new confirmed booking is created, increase count
          if (payload.new && (payload.new as any).status === 'confirmed') {
            if ((payload.new as any).booking_scope === 'audience') return
            const eventId = (payload.new as any).event_id
            setEventConfirmedCounts(prev => ({
              ...prev,
              [eventId]: (prev[eventId] || 0) + 1
            }))
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'bookings'
        },
        async (payload) => {
          // Update event confirmed counts when booking status changes
          const newBooking = payload.new as any
          const oldBooking = payload.old as any
          if (!newBooking || !oldBooking) return
          
          const eventId = newBooking.event_id
          if (newBooking.booking_scope === 'audience' || oldBooking.booking_scope === 'audience') return
          
          // If status changed from confirmed to something else, decrease count
          if (oldBooking.status === 'confirmed' && newBooking.status !== 'confirmed') {
            setEventConfirmedCounts(prev => ({
              ...prev,
              [eventId]: Math.max(0, (prev[eventId] || 0) - 1)
            }))
          }
          // If status changed to confirmed, increase count
          else if (oldBooking.status !== 'confirmed' && newBooking.status === 'confirmed') {
            setEventConfirmedCounts(prev => ({
              ...prev,
              [eventId]: (prev[eventId] || 0) + 1
            }))
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'bookings'
        },
        async (payload) => {
          // When a confirmed booking is deleted, decrease count
          if (payload.old && (payload.old as any).status === 'confirmed') {
            if ((payload.old as any).booking_scope === 'audience') return
            const eventId = (payload.old as any).event_id
            setEventConfirmedCounts(prev => ({
              ...prev,
              [eventId]: Math.max(0, (prev[eventId] || 0) - 1)
            }))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, myBookings])

  async function checkAuth(userId: string) {
    try {
      // Check user role
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

      if (!profileError && profile) {
        setUserRole(profile.role)
        setIsAdmin(profile.role === 'admin')
      } else {
        // Fallback: check admin_users table for backward compatibility
        const { data: adminData } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', userId)
          .single()

        setIsAdmin(!!adminData)
        setUserRole(adminData ? 'admin' : 'performer')
      }

      // Check for existing role change request
      const { data: requestData } = await supabase
        .from('role_change_requests')
        .select('status')
        .eq('user_id', userId)
        .eq('requested_role', 'event_creator')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (requestData) {
        setRoleRequestStatus(requestData.status)
      }

      loadData(userId)
    } catch (error: any) {
      setError(error.message || 'Failed to restore your session')
      setLoading(false)
    }
  }

  async function loadData(userId: string) {
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError
      setProfile(profileData)

      // Load upcoming and in-progress events
      const nowIso = new Date().toISOString()
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .neq('status', 'cancelled')
        .or(`date.gte.${nowIso},end_time.gte.${nowIso}`)
        .order('date', { ascending: true })

      if (eventsError) throw eventsError
      setEvents(eventsData || [])

      // Load confirmed booking counts for all events
      if (eventsData && eventsData.length > 0) {
        const eventIds = eventsData.map(e => e.id)
        const { data: confirmedCountsData, error: countsError } = await supabase
          .from('bookings')
          .select('event_id, status, booking_scope')
          .in('event_id', eventIds)
          .eq('status', 'confirmed')

        if (!countsError && confirmedCountsData) {
          const counts: Record<string, number> = {}
          confirmedCountsData.forEach((booking: any) => {
            if (booking.booking_scope === 'audience') return
            counts[booking.event_id] = (counts[booking.event_id] || 0) + 1
          })
          setEventConfirmedCounts(counts)
        }
      }

      // Load user's bookings (confirmed, waitlist, cancelled)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          events (*)
        `)
        .eq('user_id', userId)
        .in('status', ['confirmed', 'waitlist', 'cancelled'])

      if (bookingsError) throw bookingsError
      setMyBookings(bookingsData || [])

      const { data: inviteData, error: inviteError } = await supabase
        .from('event_invites')
        .select('event_id, status')
        .eq('invited_user_id', userId)
        .in('status', ['pending', 'accepted'])

      if (!inviteError && inviteData) {
        setInvitedEventIds(new Set(inviteData.map((invite: any) => invite.event_id)))
      }

      // Load existing registration alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('registration_alerts')
        .select('event_id')
        .eq('user_id', userId)

      if (alertsError) {
        const missingTable = alertsError.code === '42P01' || alertsError.message?.includes('registration_alerts')
        if (!missingTable) {
          console.warn('Error loading registration alerts:', alertsError)
        }
        setAlertSet(new Set())
      } else if (alertsData) {
        setAlertSet(new Set(alertsData.map(a => a.event_id)))
      }

      await loadPushPrefs(userId)

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetAlert(eventId: string) {
    if (!profile) return

    setSettingAlert(eventId)
    setError('')

    try {
      const response = await fetch('/api/set-registration-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to set alert')
      }

      setAlertSet(prev => new Set([...prev, eventId]))
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSettingAlert(null)
    }
  }

  async function handleBookEvent(event: Event, selectedArtTypeId?: string) {
    if (!profile) return

    setBookingLoading(event.id)
    setError('')

    try {
      if (event.tickets_enabled && event.event_type !== 'open_mic') {
        throw new Error('This event uses external tickets')
      }
      if (event.event_type === 'booked_show') {
        throw new Error('This show is invite-only')
      }
      if (event.status === 'cancelled') {
        throw new Error('This event has been cancelled')
      }
      if (
        userRole !== 'audience' &&
        event.event_type === 'open_mic' &&
        (event as any).open_mic_type === 'variety_arts_open_mic' &&
        !selectedArtTypeId
      ) {
        setBookingLoading(null)
        await openVarietyPicker(event)
        return
      }

      // Check if registration is open
      if (event.registration_opens_at) {
        const registrationOpensAt = new Date(event.registration_opens_at)
        const now = new Date()
        if (now < registrationOpensAt) {
          throw new Error(`Registration opens on ${formatDateTime(registrationOpensAt)}`)
        }
      }

      // Check if already booked (confirmed or waitlist)
      const alreadyBooked = myBookings.some(
        b => b.event_id === event.id && (b.status === 'confirmed' || b.status === 'waitlist')
      )
      if (alreadyBooked) {
        throw new Error('You have already booked this event')
      }

      const now = new Date()
      const eventStart = new Date(event.date)
      const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60)
      const cancellationWindow = event.cancellation_hours || 4
      const inNoRefundWindow = hoursUntilEvent < cancellationWindow
      const confirmedCount = eventConfirmedCounts[event.id] || 0
      const isFullAtConfirmation = event.max_attendees !== null && confirmedCount >= event.max_attendees
      const performerFreeSpot = userRole !== 'audience' && getEffectiveCreditsRequired(event) <= 0
      const noShowPenalty = getEffectiveNoShowPenalty(event)
      const showFreeSpotPenaltyMessage =
        performerFreeSpot &&
        !isFullAtConfirmation &&
        noShowPenalty.enabled &&
        noShowPenalty.credits > 0

      if (inNoRefundWindow || showFreeSpotPenaltyMessage) {
        let confirmMessage = isFullAtConfirmation
          ? `This event is currently full, so you will join the waitlist.\n\nIf you get promoted to confirmed inside ${cancellationWindow} hours of the start time, cancelling later may not be refundable.`
          : inNoRefundWindow
          ? `This booking is inside the ${cancellationWindow}-hour no-refund window.\n\nIf you book now and cancel later, you may not receive a credit refund.`
          : `You are booking a free performer spot.`

        if (showFreeSpotPenaltyMessage) {
          confirmMessage += `\n\nNo-show policy: if you are not marked attended by the host by event end time, ${noShowPenalty.credits} credit${noShowPenalty.credits > 1 ? 's will be' : ' will be'} charged as a no-show penalty. If your balance is low, it may go negative and you will need to buy credits to clear it.`
        }

        confirmMessage += '\n\nDo you want to continue?'

        const shouldProceed = await confirm({
          title: 'Please read before you confirm',
          message: confirmMessage,
          confirmText: isFullAtConfirmation ? 'Join Waitlist' : 'Book Spot',
          cancelText: 'Nevermind',
        })
        if (!shouldProceed) {
          return
        }
      }

      const isAudienceUser = userRole === 'audience'
      const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 1))
      const audienceHasFreePass = Number(profile.audience_free_passes_remaining || 0) > 0
      const effectiveCreditsRequired = isAudienceUser
        ? (audienceHasFreePass ? 0 : audienceDepositCredits)
        : getEffectiveCreditsRequired(event)
      if (profile.credits < effectiveCreditsRequired) {
        throw new Error('Insufficient credits')
      }
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId: event.id, eventArtTypeId: selectedArtTypeId || null }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create booking')
      }

      if (result.bookingStatus === 'confirmed' && result.bookingId) {
        sendBookingConfirmationEmail(profile.id, result.bookingId, event.id).catch((emailError) => {
          console.warn('Failed to send booking confirmation email:', emailError)
        })
      }

      await loadData(profile.id)

      if (result.bookingStatus === 'waitlist') {
        toast.success('Event is full. You have been added to the waitlist. You will be notified if a spot opens up.')
      } else if (result.voucher) {
        toast.success(`Event booked successfully! Food coupon issued: ${result.voucher.code}`)
      } else {
        toast.success('Event booked successfully!')
      }

      await maybeShowPushPrePromptAfterBooking()

    } catch (error: any) {
      setError(error.message)
      
      // Better error message if capacity is reached
      if (error.message.includes('full capacity')) {
        toast.info('Event is at full capacity. You have been added to the waitlist instead.')
        // Retry as waitlist
        // (You could add logic here to automatically try booking as waitlist)
      } else {
        toast.error(error.message)
      }
    } finally {
      setBookingLoading(null)
    }
  }

  async function handleSignOut() {
    await signOutAndCleanup()
    router.push('/')
  }

  function dismissInstallBanner() {
    if (!user) return
    window.localStorage.setItem(getInstallBannerDismissedKey(user.id), '1')
    setShowInstallBanner(false)
  }

  async function handleInstallFromBanner() {
    if (installPlatform === 'android' && installPromptAvailable) {
      setInstallActionLoading(true)
      try {
        const result = await triggerDeferredInstallPrompt()
        if (result.outcome === 'accepted') {
          setShowInstallBanner(false)
          return
        }
      } finally {
        setInstallActionLoading(false)
      }
    } else {
      setShowInstallHelp((prev) => !prev)
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
    <div className="min-h-screen bg-background">
      <Dialog open={varietyDialogOpen} onOpenChange={setVarietyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select your art type</DialogTitle>
            <DialogDescription>
              Choose which performance type you want to book for this variety arts open mic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {varietyOptions.map((option) => {
              const spotsLeft = Math.max(0, option.capacity - option.confirmedCount)
              const useGlobalVarietyCapacity =
                !!varietyDialogEvent &&
                varietyDialogEvent.event_type === 'open_mic' &&
                (varietyDialogEvent as any).open_mic_type === 'variety_arts_open_mic' &&
                !!(varietyDialogEvent as any).variety_use_max_attendees
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedVarietyOptionId(option.id)}
                  className={cn(
                    'w-full rounded-md border px-3 py-2 text-left',
                    selectedVarietyOptionId === option.id && 'border-primary bg-primary/5'
                  )}
                >
                  <div className="font-medium">{option.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {useGlobalVarietyCapacity
                      ? 'Category available'
                      : `${option.confirmedCount}/${option.capacity} confirmed${spotsLeft === 0 ? ' (full, joins waitlist)' : ` (${spotsLeft} spot${spotsLeft === 1 ? '' : 's'} left)`} · ${option.waitlistCount} waitlisted`}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={async () => {
                if (!varietyDialogEvent || !selectedVarietyOptionId) return
                setVarietyDialogOpen(false)
                await handleBookEvent(varietyDialogEvent, selectedVarietyOptionId)
              }}
              disabled={!selectedVarietyOptionId}
            >
              Continue Booking
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => setVarietyDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={redeemInfoDialogOpen} onOpenChange={setRedeemInfoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redeemable credits</DialogTitle>
            <DialogDescription>
              This event has attendee redeemable credits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Redeemable credits apply to attendee participation, not performer booking.</p>
            <p>Tap below to view the full explainer for how redeemable credits work.</p>
          </div>
          <div className="flex justify-end">
            <Button asChild variant="outline" size="sm">
              <Link href="/redeemable-credits">How this works</Link>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <PushPermissionPrePrompt
        open={showPushPrePrompt}
        onEnable={handleEnablePushFromPrePrompt}
        onNotNow={handlePrePromptNotNow}
        loading={pushActionLoading}
      />
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-28">
        {/* Role Request Status / Apply Section */}
        {userRole === 'performer' && (
          <div className="mb-6">
            {roleRequestStatus === 'pending' && (
              <Card className="border-yellow-200 bg-yellow-50/50 shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-yellow-900">Application Pending</CardTitle>
                    <p className="text-sm text-yellow-700 leading-relaxed">Your request to become an Event Creator is under review.</p>
                  </div>
                  <Button asChild variant="default" className="bg-yellow-600 hover:bg-yellow-700 shrink-0">
                    <Link href="/apply-event-creator">View Status</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {roleRequestStatus === 'rejected' && (
              <Card className="border-red-200 bg-red-50/50 shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-red-900">Application Rejected</CardTitle>
                    <p className="text-sm text-red-700 leading-relaxed">Your previous request was rejected. You can submit a new application.</p>
                  </div>
                  <Button asChild variant="destructive" className="shrink-0">
                    <Link href="/apply-event-creator">Reapply</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            {!roleRequestStatus && (
              <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-blue-900">Become an Event Creator</CardTitle>
                    <p className="text-sm text-blue-700 leading-relaxed">Create and manage your own events! Apply now.</p>
                  </div>
                  <Button asChild className="shrink-0">
                    <Link href="/apply-event-creator">Apply Now</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {showInstallBanner && (
          <Card className="mb-6 border-blue-200 bg-blue-50/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg font-semibold text-blue-900">Install app for quicker access</CardTitle>
                  <p className="text-sm text-blue-700 mt-1">
                    Add Laal Button to your home screen so it opens like a native app.
                  </p>
                </div>
                <Download className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleInstallFromBanner} disabled={installActionLoading}>
                  {installActionLoading ? 'Opening...' : 'Install App'}
                </Button>
                <Button variant="outline" onClick={dismissInstallBanner}>
                  Not now
                </Button>
              </div>
              {showInstallHelp && (
                <div className="rounded-md border border-blue-200 bg-white p-3 text-sm text-blue-900">
                  {installPlatform === 'ios' ? (
                    <p>
                      On iPhone: open Safari Share menu, tap <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
                    </p>
                  ) : (
                    <p>
                      Use your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Credits Card */}
        <Card className="bg-gradient-to-r from-emerald-600 to-teal-700 border-0 text-white shadow-lg mb-8">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-2 sm:gap-3 flex-nowrap">
              <span className="text-2xl sm:text-3xl font-bold drop-shadow-md tracking-tight shrink-0">{profile?.credits || 0}</span>
              <span className="text-sm sm:text-base drop-shadow text-white/90 shrink-0">credits</span>
              <div className="flex-1 min-w-0" />
              <Button
                asChild
                type="button"
                size="sm"
                className="bg-white text-emerald-700 hover:bg-white/90 shrink-0"
              >
                <Link href="/buy-credits">Buy Credits</Link>
              </Button>
              <Button asChild variant="secondary" size="sm" className="bg-white/10 text-white hover:bg-white/20 shrink-0">
                <Link href="/credits">Credits History</Link>
              </Button>
            </div>
            {userRole === 'audience' && (
              <p className="mt-4 text-sm text-white/90">
                {Number(profile?.audience_free_passes_remaining || 0) > 0
                  ? `You have ${profile?.audience_free_passes_remaining || 0} free pass available.`
                  : 'No free pass remaining right now.'}
              </p>
            )}
          </CardContent>
        </Card>


        {error && (
          <Card className="border-destructive bg-destructive/15 mb-6 shadow-sm">
            <CardContent className="p-4">
              <p className="text-destructive text-sm leading-relaxed">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Available Events Section */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6 tracking-tight">Available Events</h2>

          {userRole !== 'audience' ? (
            <Tabs value={eventTab} onValueChange={(value) => setEventTab(value as 'perform' | 'attend')} className="mb-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="perform">Perform</TabsTrigger>
                <TabsTrigger value="attend">Attend</TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <div className="mb-4 rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
              Audience mode: use Attend events only.
            </div>
          )}

          {(() => {
            const isAudienceUser = userRole === 'audience'
            const filteredEvents = events.filter((event) =>
              isAudienceUser
                ? event.event_type === 'open_mic'
                : eventTab === 'perform'
                ? event.event_type === 'open_mic'
                : event.event_type === 'booked_show'
                  ? !invitedEventIds.has(event.id)
                  : event.tickets_enabled && event.event_type !== 'open_mic'
            )

            if (filteredEvents.length === 0) {
              return (
                <Card className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    {(userRole !== 'audience' && eventTab === 'perform')
                      ? 'No upcoming events available to perform'
                      : 'No upcoming shows available to attend'}
                  </CardContent>
                </Card>
              )
            }

            return (
              <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 -mx-4 sm:mx-0 px-0">
                {filteredEvents.map((event) => {
                  const activeBooking = myBookings.find(
                    (b) =>
                      b.event_id === event.id &&
                      (b.status === 'confirmed' || b.status === 'waitlist')
                  )
                  const isBooked = !!activeBooking
                  const effectiveCreditsRequired = getEffectiveCreditsRequired(event)
                  const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 1))
                  const audienceHasFreePass = Number(profile?.audience_free_passes_remaining || 0) > 0
                  const isAudienceUser = userRole === 'audience'
                  const creditsRequiredForCard = isAudienceUser
                    ? (audienceHasFreePass ? 0 : audienceDepositCredits)
                    : effectiveCreditsRequired
                  const hasRedeemableCredits = event.tickets_enabled && Number((event as any).audience_deposit_credits || 0) > 0
                  const showRedeemableHelpDot = hasRedeemableCredits && isAudienceUser
                  const languageSummary = formatEventLanguages(event)
                  const canAfford = (profile?.credits || 0) >= creditsRequiredForCard
                  const isBooking = bookingLoading === event.id
                  const now = new Date()
                  const startTime = new Date(event.date)
                  const endTime = event.end_time
                    ? new Date(event.end_time)
                    : new Date(new Date(event.date).getTime() + 2 * 60 * 60 * 1000)
                  const isInProgress = startTime <= now && now < endTime
                  
                  // Check if registration is open
                  const isRegistrationOpen = !event.registration_opens_at || new Date() >= new Date(event.registration_opens_at)
                  const registrationOpensAt = event.registration_opens_at ? new Date(event.registration_opens_at) : null
                  
                  // Check if event is full
                  const confirmedCount = eventConfirmedCounts[event.id] || 0
                  const isFull = event.max_attendees !== null && confirmedCount >= event.max_attendees
                  const spotsLeft = event.max_attendees !== null
                    ? event.max_attendees - confirmedCount
                    : null

                  return (
                    <Link
                      key={event.id}
                      href={`/events/${event.id}`}
                      className="block active:opacity-90"
                    >
                      <Card className="hover:border-primary/60 hover:shadow-sm transition-all active:bg-muted/40 rounded-none sm:rounded-lg border-x-0 sm:border-x">
                        <CardHeader className="pb-3">
                          <div className="flex justify-between items-start gap-2">
                            <CardTitle className="text-base md:text-lg flex-1">
                              {event.title}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                              {isInProgress && (
                                <Badge variant="outline" className="text-blue-600 border-blue-600 whitespace-nowrap">
                                  In Progress
                                </Badge>
                              )}
                              {event.event_type !== 'booked_show' && (
                                <div className="inline-flex items-center gap-1.5">
                                  <Badge variant="secondary" className="whitespace-nowrap">
                                    {creditsRequiredForCard} {creditsRequiredForCard === 1 ? 'credit' : 'credits'}
                                  </Badge>
                                  {showRedeemableHelpDot && (
                                    <button
                                      type="button"
                                      className="h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-red-200"
                                      aria-label="What are redeemable credits?"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setRedeemInfoDialogOpen(true)
                                      }}
                                    />
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-xs text-muted-foreground line-clamp-1 break-words whitespace-normal">
                            {event.description}
                          </p>
                          
                          <div className="text-xs text-muted-foreground">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1">
                                <span>📅</span>
                                <span>{formatDateTime(event.date)}</span>
                              </div>
                              {event.max_attendees && spotsLeft !== null && (
                                <div className="whitespace-nowrap">
                                  👥 {spotsLeft} / {event.max_attendees} spots left
                                </div>
                              )}
                            </div>
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div className="flex items-center gap-1">
                                <span>📍</span>
                                <span>{formatVenueName(event.location)}</span>
                              </div>
                              <div className="whitespace-nowrap">
                                {event.theme ? `🎨 ${event.theme}` : ''}
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                              <div className="min-w-0 flex-1 pr-2 text-xs text-muted-foreground truncate">
                                🗣️ {languageSummary}
                              </div>
                              <div className="whitespace-nowrap shrink-0 text-[11px] sm:text-xs">
                                {getRatingDisplay(event.rating)}
                              </div>
                            </div>
                            {!isRegistrationOpen && registrationOpensAt && (
                              <div className="flex items-center justify-between gap-2 pt-1 border-t">
                                <Badge variant="outline" className="text-orange-600 border-orange-600 whitespace-nowrap">
                                  ⏰ Opens: {formatDateTime(registrationOpensAt)}
                                </Badge>
                              </div>
                            )}
                          </div>

                          {event.event_type !== 'booked_show' && (
                            <div className="flex items-center justify-between gap-2 pt-2 border-t">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  ⏱️ Cancel {event.cancellation_hours || 4}h before
                                </p>
                                {isAudienceUser && (
                                  <p className="text-xs text-muted-foreground">
                                    {audienceHasFreePass
                                      ? '1 free audience pass will be used'
                                      : `Deposit hold ${audienceDepositCredits} credit${audienceDepositCredits === 1 ? '' : 's'}`}
                                  </p>
                                )}
                                {event.food_coupon_enabled && (
                                  <p className="text-xs text-muted-foreground">
                                    Spot fee {event.spot_fee_credits || 0} credits + coupon ${(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100).toFixed(2)}
                                  </p>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 shrink-0">
                                {event.poster_url && (
                                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border bg-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={event.poster_url}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                {isBooked ? (
                                  activeBooking?.status === 'waitlist' ? (
                                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                                      ⏳ Waitlisted
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-green-600 border-green-600">
                                      ✓ Booked
                                    </Badge>
                                  )
                                ) : event.status === 'cancelled' ? (
                                  <Badge variant="destructive">Cancelled</Badge>
                                ) : !isRegistrationOpen ? (
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                                      Not Open
                                    </Badge>
                                    {!alertSet.has(event.id) && (
                                      <Button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleSetAlert(event.id)
                                        }}
                                        disabled={settingAlert === event.id}
                                        size="sm"
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {settingAlert === event.id ? 'Setting...' : 'Alert Me'}
                                      </Button>
                                    )}
                                    {alertSet.has(event.id) && (
                                      <Badge variant="outline" className="text-green-600 border-green-600 text-xs">
                                        ✓ Alert Set
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <Button
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleBookEvent(event)
                                    }}
                                    disabled={!canAfford || isBooking}
                                    size="sm"
                                    className="text-xs"
                                  >
                                    {isBooking 
                                      ? 'Booking...' 
                                      : !canAfford 
                                        ? 'Not enough credits' 
                                        : isFull 
                                          ? 'Join Waitlist' 
                                          : isAudienceUser ? 'Reserve Spot' : 'Book Event'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          {(event.event_type === 'booked_show' || (event.tickets_enabled && event.event_type !== 'open_mic')) && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t">
                              {event.poster_url && (
                                <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-border bg-muted">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={event.poster_url}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                              )}
                              {event.tickets_enabled && event.external_event && event.external_ticket_url ? (
                                <a
                                  href={event.external_ticket_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Button size="sm" variant="outline" className="text-xs">
                                    Buy Tickets
                                  </Button>
                                </a>
                              ) : event.tickets_enabled ? (
                                <Badge variant="outline">Tickets available</Badge>
                              ) : (
                                <Badge variant="outline">Invite only</Badge>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )
          })()}
        </div>

      </div>
    </div>
  )
}