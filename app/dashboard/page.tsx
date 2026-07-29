'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event, Booking } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'
import Link from 'next/link'
import { createNotification } from '@/lib/notifications'
import { sendBookingConfirmationEmail, sendWaitlistPromotionEmail, sendWaitlistPositionEmail } from '@/lib/emailService'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { cn } from '@/lib/utils'
import { NotificationsBellLink } from '@/components/NotificationsBellLink'
import { ChevronDown, Download, Filter, Gift } from 'lucide-react'
import { EventCardSkeleton } from '@/components/skeletons/EventCardSkeleton'
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
import { INSTALL_PROMPT_ENABLED } from '@/lib/featureFlags'
import { getSpendableRegularCredits } from '@/lib/creditLedger'
import {
  canAffordWithVenueCredits,
  venueCreditsForEvent,
  type VenueCreditGrant,
} from '@/lib/venueCredits'
import {
  bookingMatchesUserIntent,
  confirmAndCancelCrossScopeBooking,
  findActiveBookingForEvent,
  isAudienceBookingScope,
} from '@/lib/bookingScopeUtils'

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

type InviteItem = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  events: {
    id: string
    title: string
    date: string
    location: string | null
    venue_id: string | null
    credits_required: number | null
    event_type: string | null
  }
}

type PerformKindFilter = 'comedy_open_mic' | 'variety_arts_open_mic'

const PERFORM_KIND_FILTER_OPTIONS: { value: PerformKindFilter; label: string }[] = [
  { value: 'comedy_open_mic', label: 'Comedy open mic' },
  { value: 'variety_arts_open_mic', label: 'Variety arts open mic' },
]

const PERFORM_FILTERS_STORAGE_KEY = 'dashboard-perform-filters-v1'

/** Stored in performFilterLanguages alongside real language names; matches events with only English (no other languages). */
const PERFORM_FILTER_ENGLISH_ONLY = '__english_only__'

const VALID_PERFORM_KINDS = new Set<PerformKindFilter>([
  'comedy_open_mic',
  'variety_arts_open_mic',
])

function parseStoredPerformKinds(raw: unknown): PerformKindFilter[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((k): k is PerformKindFilter => typeof k === 'string' && VALID_PERFORM_KINDS.has(k as PerformKindFilter))
}

function parseStoredStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((x): x is string => typeof x === 'string' && x.length > 0)
}

export default function Dashboard() {
  const { confirm } = useConfirmDialog()
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  /** Venue rows keyed by id — used for city / name on Perform tab filters */
  const [venueById, setVenueById] = useState<Record<string, { name: string; city: string | null }>>({})
  /** Ticket price/availability for booked/ticketed shows, keyed by event id — used for Attend cards */
  const [ticketByEvent, setTicketByEvent] = useState<Record<string, { price_cents: number; quantity: number; sold: number }>>({})
  /** User's completed ticket purchases keyed by event id — used to show Go to ticket on Attend cards */
  const [myTicketsByEvent, setMyTicketsByEvent] = useState<Record<string, { id: string; quantity: number }>>({})
  /** Perform-tab-only filters (dashboard Available Events → Perform); empty array = no filter on that dimension */
  const [performFilterKinds, setPerformFilterKinds] = useState<PerformKindFilter[]>([])
  const [performFilterCities, setPerformFilterCities] = useState<string[]>([])
  const [performFilterVenueKeys, setPerformFilterVenueKeys] = useState<string[]>([])
  const [performFilterLanguages, setPerformFilterLanguages] = useState<string[]>([])
  const [performFilterDialogOpen, setPerformFilterDialogOpen] = useState(false)
  /** After load-from-storage runs; defer persist until after applied state is committed */
  const performFiltersPersistReadyRef = useRef(false)
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [invites, setInvites] = useState<InviteItem[]>([])
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState<string | null>(null)
  const [optimisticBookings, setOptimisticBookings] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleRequestStatus, setRoleRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [isCommunityEventCreator, setIsCommunityEventCreator] = useState(false)
  const [hasCreatedEvents, setHasCreatedEvents] = useState(false)
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
  const [venueCreditGrants, setVenueCreditGrants] = useState<VenueCreditGrant[]>([])
  const activeVenueGrantCount = venueCreditGrants.length
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

  function getEventTimeBucket(eventDate: Date, now: Date): 'this_week' | 'next_week' | 'later' {
    const day = now.getDay()
    const endThisWeek = new Date(now)
    endThisWeek.setDate(now.getDate() + (day === 0 ? 0 : 7 - day))
    endThisWeek.setHours(23, 59, 59, 999)
    const startNextWeek = new Date(endThisWeek)
    startNextWeek.setDate(startNextWeek.getDate() + 1)
    startNextWeek.setHours(0, 0, 0, 0)
    const endNextWeek = new Date(startNextWeek)
    endNextWeek.setDate(endNextWeek.getDate() + 6)
    endNextWeek.setHours(23, 59, 59, 999)
    if (eventDate <= endThisWeek) return 'this_week'
    if (eventDate <= endNextWeek) return 'next_week'
    return 'later'
  }

  function getEffectiveCreditsRequired(event: Event): number {
    if (!event.food_coupon_enabled) return Math.max(0, Number(event.credits_required ?? 0))
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

  function inferCityFromLocationText(location: string): string {
    if (!location) return ''
    const parts = location.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length >= 2) return parts[parts.length - 2]
    return ''
  }

  function getDashboardVenueKey(e: Event): string {
    const vid = e.venue_id
    if (vid) return `venue:${vid}`
    return `loc:${formatLocationValue(e.location)}`
  }

  function getDashboardVenueLabelForFilter(e: Event): string {
    const vid = e.venue_id
    if (vid && venueById[vid]?.name) return venueById[vid].name
    return formatVenueName(e.location)
  }

  function getDashboardEventCity(e: Event): string {
    const vid = e.venue_id
    if (vid && venueById[vid]?.city) return venueById[vid].city.trim()
    return inferCityFromLocationText(formatLocationValue(e.location))
  }

  function getEventLanguageTags(e: Event): string[] {
    const langs = Array.isArray((e as any).languages) ? (e as any).languages : ['English']
    return langs
      .map((lang: string) => String(lang || '').trim())
      .filter(Boolean)
  }

  /** True when the event lists no non-English languages (empty/missing defaults to English-only for display). */
  function eventIsEnglishOnly(e: Event): boolean {
    const tags = getEventLanguageTags(e)
    if (tags.length === 0) return true
    return tags.every((t) => t.toLowerCase() === 'english')
  }

  function eventMatchesPerformKindOption(ev: Event, kind: PerformKindFilter): boolean {
    if (kind === 'comedy_open_mic') {
      if (ev.event_type !== 'open_mic') return false
      const om = (ev as any).open_mic_type ?? 'comedy_open_mic'
      return om === 'comedy_open_mic'
    }
    return ev.event_type === 'open_mic' && (ev as any).open_mic_type === 'variety_arts_open_mic'
  }

  function eventMatchesPerformFilters(e: Event): boolean {
    if (performFilterKinds.length > 0) {
      if (!performFilterKinds.some((k) => eventMatchesPerformKindOption(e, k))) return false
    }
    if (performFilterCities.length > 0) {
      const c = getDashboardEventCity(e).toLowerCase()
      if (!performFilterCities.some((x) => x.toLowerCase() === c)) return false
    }
    if (performFilterVenueKeys.length > 0) {
      if (!performFilterVenueKeys.includes(getDashboardVenueKey(e))) return false
    }
    if (performFilterLanguages.length > 0) {
      const tagsLower = getEventLanguageTags(e).map((t) => t.toLowerCase())
      const matchesLang = performFilterLanguages.some((lang) => {
        if (lang === PERFORM_FILTER_ENGLISH_ONLY) return eventIsEnglishOnly(e)
        return tagsLower.includes(lang.toLowerCase())
      })
      if (!matchesLang) return false
    }
    return true
  }

  const performFilterOptions = useMemo(() => {
    if (userRole === 'audience') {
      return { cities: [] as string[], venues: [] as { key: string; label: string }[], languages: [] as string[] }
    }
    const scope = events.filter((ev) => ev.event_type === 'open_mic')
    const cities = new Set<string>()
    const venueMap = new Map<string, string>()
    const langSet = new Set<string>()
    for (const ev of scope) {
      const city = getDashboardEventCity(ev)
      if (city) cities.add(city)
      venueMap.set(getDashboardVenueKey(ev), getDashboardVenueLabelForFilter(ev))
      for (const lang of getEventLanguageTags(ev)) langSet.add(lang)
    }
    return {
      cities: [...cities].sort((a, b) => a.localeCompare(b)),
      venues: [...venueMap.entries()]
        .map(([key, label]) => ({ key, label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      languages: [...langSet].sort((a, b) => a.localeCompare(b)),
    }
  }, [events, venueById, userRole])

  const performVenueOptionsForDialog = useMemo(() => {
    const venues = performFilterOptions.venues
    if (performFilterCities.length === 0) return venues
    return venues.filter((v) => {
      const ev = events.find((e) => getDashboardVenueKey(e) === v.key)
      if (!ev) return false
      const city = getDashboardEventCity(ev)
      return performFilterCities.some((c) => c.toLowerCase() === city.toLowerCase())
    })
  }, [performFilterOptions.venues, performFilterCities, events, venueById])

  useEffect(() => {
    if (performFilterCities.length === 0) return
    setPerformFilterVenueKeys((keys) =>
      keys.filter((k) => {
        const ev = events.find((e) => getDashboardVenueKey(e) === k)
        if (!ev) return false
        const city = getDashboardEventCity(ev)
        return performFilterCities.some((c) => c.toLowerCase() === city.toLowerCase())
      })
    )
  }, [performFilterCities, events, venueById])

  const hasActivePerformFilters =
    performFilterKinds.length > 0 ||
    performFilterCities.length > 0 ||
    performFilterVenueKeys.length > 0 ||
    performFilterLanguages.length > 0

  function clearPerformFilters() {
    setPerformFilterKinds([])
    setPerformFilterCities([])
    setPerformFilterVenueKeys([])
    setPerformFilterLanguages([])
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERFORM_FILTERS_STORAGE_KEY)
      if (raw) {
        const p = JSON.parse(raw) as Record<string, unknown>
        setPerformFilterKinds(parseStoredPerformKinds(p.kinds))
        setPerformFilterCities(parseStoredStringArray(p.cities))
        setPerformFilterVenueKeys(parseStoredStringArray(p.venueKeys))
        setPerformFilterLanguages(parseStoredStringArray(p.languages))
      }
    } catch {
      // ignore corrupt storage
    }
    queueMicrotask(() => {
      performFiltersPersistReadyRef.current = true
    })
  }, [])

  useEffect(() => {
    if (!performFiltersPersistReadyRef.current) return
    try {
      localStorage.setItem(
        PERFORM_FILTERS_STORAGE_KEY,
        JSON.stringify({
          kinds: performFilterKinds,
          cities: performFilterCities,
          venueKeys: performFilterVenueKeys,
          languages: performFilterLanguages,
        })
      )
    } catch {
      // quota / private mode
    }
  }, [performFilterKinds, performFilterCities, performFilterVenueKeys, performFilterLanguages])

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
    if (!authResolved || !user || !INSTALL_PROMPT_ENABLED) return

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

  // Grant 5 credits when user has installed the app (standalone mode)
  useEffect(() => {
    if (!authResolved || !user || !isStandaloneMode() || !INSTALL_PROMPT_ENABLED) return

    let cancelled = false
    async function claimInstallBonus() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token || cancelled) return

        const res = await fetch('/api/credits/install-bonus', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.success && !data.alreadyGranted && data.credits != null) {
          toast.success('You earned 5 free credits for installing the app!')
          setProfile((p) => (p ? { ...p, credits: data.credits } : null))
        }
      } catch {
        // Silent fail
      }
    }
    void claimInstallBonus()
    return () => { cancelled = true }
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
            loadData(profile.id, null)
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
      // Fetch full profile and role metadata in one query (avoids duplicate fetch in loadData)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      let resolvedRole: string = 'performer'
      if (!profileError && profileData) {
        resolvedRole = profileData.role
        setUserRole(profileData.role)
        setIsAdmin(profileData.role === 'admin')
      } else {
        // Fallback: check admin_users table for backward compatibility
        const { data: adminData } = await supabase
          .from('admin_users')
          .select('*')
          .eq('user_id', userId)
          .single()

        setIsAdmin(!!adminData)
        resolvedRole = adminData ? 'admin' : 'performer'
        setUserRole(resolvedRole)
      }

      // Fetch role metadata in parallel — all three only need userId
      const [requestResult, creatorCountResult, createdCountResult] = await Promise.all([
        supabase
          .from('role_change_requests')
          .select('status')
          .eq('user_id', userId)
          .eq('requested_role', 'event_creator')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('community_members')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .in('role', ['event_creator', 'co_admin', 'admin']),
        supabase
          .from('events')
          .select('id', { count: 'exact', head: true })
          .eq('created_by', userId),
      ])

      if (requestResult.data) setRoleRequestStatus(requestResult.data.status)
      setIsCommunityEventCreator((creatorCountResult.count || 0) > 0)
      setHasCreatedEvents((createdCountResult.count || 0) > 0)

      // Pass the already-loaded profile to loadData to avoid a duplicate fetch
      loadData(userId, profileData || null)
    } catch (error: any) {
      setError(error.message || 'Failed to restore your session')
      setLoading(false)
    }
  }

  async function loadData(userId: string, preloadedProfile: any) {
    try {
      // Use the profile already loaded in checkAuth — no duplicate fetch needed
      if (preloadedProfile) {
        setProfile(preloadedProfile)
      } else {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (profileError) throw profileError
        setProfile(profileData)
      }

      // Load active venue credit grants (used for affordability + header badge)
      void (async () => {
        const now = new Date().toISOString()
        const { data: grantRows } = await supabase
          .from('venue_credit_grants')
          .select('venue_id, credits_remaining')
          .eq('user_id', userId)
          .gt('credits_remaining', 0)
          .or(`expires_at.is.null,expires_at.gt.${now}`)
        setVenueCreditGrants(
          (grantRows || []) as VenueCreditGrant[],
        )
      })()

      // Load upcoming and in-progress events, scoped to communities the user belongs to
      const nowIso = new Date().toISOString()

      // Get user's community memberships
      const { data: memberships } = await supabase
        .from('community_members')
        .select('community_id')
        .eq('user_id', userId)

      const communityIds = (memberships || []).map((m: { community_id: string }) => m.community_id)

      let eventsData: Event[] = []

      if (communityIds.length === 0) {
        // No communities — empty dashboard
        setEvents([])
        setVenueById({})
      } else {
        // Get approved event IDs in those communities
        const { data: eventLinks } = await supabase
          .from('event_communities')
          .select('event_id')
          .in('community_id', communityIds)
          .eq('status', 'approved')

        const eventIds = [...new Set((eventLinks || []).map((e: { event_id: string }) => e.event_id))]

        if (eventIds.length === 0) {
          setEvents([])
          setVenueById({})
        } else {
          const { data: fetchedEvents, error: eventsError } = await supabase
            .from('events')
            .select('*')
            .in('id', eventIds)
            .eq('status', 'active')
            .or(`date.gte.${nowIso},end_time.gte.${nowIso}`)
            .order('date', { ascending: true })

          if (eventsError) throw eventsError
          eventsData = fetchedEvents || []
          setEvents(eventsData)

          const venueIds = [
            ...new Set(eventsData.map((e: Event) => e.venue_id).filter(Boolean)),
          ] as string[]
          if (venueIds.length > 0) {
            const { data: venueRows } = await supabase
              .from('venues')
              .select('id,name,city')
              .in('id', venueIds)
            const map: Record<string, { name: string; city: string | null }> = {}
            for (const row of venueRows || []) {
              map[row.id] = { name: row.name, city: row.city ?? null }
            }
            setVenueById(map)
          } else {
            setVenueById({})
          }

          const ticketedEventIds = eventsData
            .filter((e: Event) => !!e.tickets_enabled)
            .map((e: Event) => e.id)
          if (ticketedEventIds.length > 0) {
            const { data: ticketRows } = await supabase
              .from('event_tickets')
              .select('event_id, price_cents, quantity, sold')
              .in('event_id', ticketedEventIds)
            const ticketMap: Record<string, { price_cents: number; quantity: number; sold: number }> = {}
            for (const row of ticketRows || []) {
              ticketMap[row.event_id as string] = {
                price_cents: Number(row.price_cents || 0),
                quantity: Number(row.quantity || 0),
                sold: Number(row.sold || 0),
              }
            }
            setTicketByEvent(ticketMap)
          } else {
            setTicketByEvent({})
          }
        }
      }

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

      // Load user-specific data in parallel — all need userId
      const [bookingsResult, inviteResult, pendingInvitesResult, alertsResult, pushPrefsResult, ticketsResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('*, events (*)')
          .eq('user_id', userId)
          .in('status', ['confirmed', 'waitlist', 'cancelled']),
        supabase
          .from('event_invites')
          .select('event_id, status')
          .eq('invited_user_id', userId)
          .in('status', ['pending', 'accepted']),
        supabase
          .from('event_invites')
          .select('id, status, created_at, events (id, title, date, location, venue_id, credits_required, event_type)')
          .eq('invited_user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
        supabase
          .from('registration_alerts')
          .select('event_id')
          .eq('user_id', userId),
        supabase
          .from('push_notification_prefs')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle(),
        supabase
          .from('ticket_purchases')
          .select('id, event_id, quantity, created_at')
          .eq('user_id', userId)
          .eq('status', 'completed')
          .order('created_at', { ascending: false }),
      ])

      if (bookingsResult.error) throw bookingsResult.error
      setMyBookings(bookingsResult.data || [])

      if (!ticketsResult.error && ticketsResult.data) {
        const ticketMap: Record<string, { id: string; quantity: number }> = {}
        for (const row of ticketsResult.data) {
          const eventId = row.event_id as string
          if (!ticketMap[eventId]) {
            ticketMap[eventId] = { id: row.id as string, quantity: Number(row.quantity || 0) }
          } else {
            ticketMap[eventId].quantity += Number(row.quantity || 0)
          }
        }
        setMyTicketsByEvent(ticketMap)
      } else {
        setMyTicketsByEvent({})
      }

      if (!inviteResult.error && inviteResult.data) {
        setInvitedEventIds(new Set(inviteResult.data.map((invite: any) => invite.event_id)))
      }

      if (!pendingInvitesResult.error) {
        setInvites((pendingInvitesResult.data || []) as any)
      } else {
        setInvites([])
      }

      if (alertsResult.error) {
        const missingTable = alertsResult.error.code === '42P01' || alertsResult.error.message?.includes('registration_alerts')
        if (!missingTable) console.warn('Error loading registration alerts:', alertsResult.error)
        setAlertSet(new Set())
      } else if (alertsResult.data) {
        setAlertSet(new Set(alertsResult.data.map((a: any) => a.event_id)))
      }

      if (!pushPrefsResult.error) {
        setPushPrefs((pushPrefsResult.data || null) as PushNotificationPrefs | null)
      }

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function respondToInvite(inviteId: string, action: 'accept' | 'decline', invite?: InviteItem) {
    // Show credit charge confirmation for booked shows with a non-zero credit cost
    if (action === 'accept' && invite) {
      const creditsRequired = invite.events.credits_required ?? 0
      const isBookedShow = invite.events.event_type === 'booked_show'
      if (isBookedShow && creditsRequired > 0) {
        if (
          !profile ||
          !canAffordWithVenueCredits(
            getSpendableRegularCredits(profile),
            venueCreditGrants,
            invite.events.venue_id,
            creditsRequired,
          )
        ) {
          toast.error('Insufficient credits')
          return
        }
        const venueCover = venueCreditsForEvent(venueCreditGrants, invite.events.venue_id)
        const regularNeeded = Math.max(0, creditsRequired - venueCover)
        const chargeNote =
          venueCover > 0 && regularNeeded > 0
            ? ` (${venueCover} from venue pass, ${regularNeeded} from your balance)`
            : venueCover > 0
              ? ' (covered by your venue pass)'
              : ''
        const shouldProceed = await confirm({
          title: 'Confirm acceptance',
          message: `Accepting this invite will charge you ${creditsRequired} credit${creditsRequired !== 1 ? 's' : ''}${chargeNote}.\n\nOnly proceed if you are okay with this charge.`,
          confirmText: `Accept & pay ${creditsRequired} credit${creditsRequired !== 1 ? 's' : ''}`,
          cancelText: 'Cancel',
          variant: 'default',
        })
        if (!shouldProceed) return
      }
    }

    setRespondingInvite(inviteId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/invites/respond', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ inviteId, action }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to respond to invite')
      }

      if (profile) {
        await loadData(profile.id, profile)
      }
    } catch (error: any) {
      console.error('Error responding to invite:', error)
      toast.error(error.message || 'Failed to respond to invite')
    } finally {
      setRespondingInvite(null)
    }
  }

  async function handleSetAlert(eventId: string) {
    if (!profile) return

    setSettingAlert(eventId)
    setError('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        setError('Please sign in to set an alert')
        return
      }

      const response = await fetch('/api/set-registration-alert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
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

      // Check if already booked for the intended scope (or handle cross-scope switch)
      const existingActiveBooking = findActiveBookingForEvent(myBookings, event.id)
      if (existingActiveBooking) {
        if (bookingMatchesUserIntent(existingActiveBooking.booking_scope, userRole)) {
          throw new Error('You have already booked this event')
        }

        const { data: sessionDataForCancel } = await supabase.auth.getSession()
        const cancelToken = sessionDataForCancel.session?.access_token
        if (!cancelToken) throw new Error('Not authenticated')

        const proceedWithSwitch = await confirmAndCancelCrossScopeBooking({
          existingBooking: existingActiveBooking,
          userRole,
          confirm,
          accessToken: cancelToken,
        })
        if (!proceedWithSwitch) return

        setMyBookings((prev) => prev.filter((b) => b.id !== existingActiveBooking.id))
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
      const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 0))
      const audienceHasFreePass = Number(profile.audience_free_passes_remaining || 0) > 0
      const effectiveCreditsRequired = isAudienceUser
        ? (audienceHasFreePass ? 0 : audienceDepositCredits)
        : getEffectiveCreditsRequired(event)
      if (
        !canAffordWithVenueCredits(
          getSpendableRegularCredits(profile),
          venueCreditGrants,
          event.venue_id,
          effectiveCreditsRequired,
        )
      ) {
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

      await loadData(profile.id, null)
      // Clear optimistic state now that real data is loaded
      setOptimisticBookings(prev => { const s = new Set(prev); s.delete(event.id); return s })

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
      <div className="min-h-screen bg-background pb-20">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
          <EventCardSkeleton />
          <EventCardSkeleton />
          <EventCardSkeleton />
        </div>
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
      <Dialog open={performFilterDialogOpen} onOpenChange={setPerformFilterDialogOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col gap-0 p-0 sm:max-w-lg">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Filter performer events</DialogTitle>
            <DialogDescription>
              Select one or more options in each category. Within a category, events matching any selected option are
              shown. Leave a category empty to include all values.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Language</Label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                <label className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-0.5 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/80">
                  <input
                    type="checkbox"
                    className="h-4 w-4 shrink-0 rounded border-input"
                    checked={performFilterLanguages.includes(PERFORM_FILTER_ENGLISH_ONLY)}
                    onChange={() =>
                      setPerformFilterLanguages((prev) =>
                        prev.includes(PERFORM_FILTER_ENGLISH_ONLY)
                          ? prev.filter((x) => x !== PERFORM_FILTER_ENGLISH_ONLY)
                          : [...prev, PERFORM_FILTER_ENGLISH_ONLY]
                      )
                    }
                  />
                  <span className="font-medium">English only</span>
                  <span className="text-xs text-muted-foreground">(English and no other language)</span>
                </label>
                {performFilterOptions.languages.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-muted-foreground border-t border-border/60 pt-2 mt-1">
                    No other language tags on your available events.
                  </p>
                ) : (
                  performFilterOptions.languages.map((lang) => (
                    <label
                      key={lang}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/80"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input"
                        checked={performFilterLanguages.includes(lang)}
                        onChange={() =>
                          setPerformFilterLanguages((prev) =>
                            prev.includes(lang) ? prev.filter((x) => x !== lang) : [...prev, lang]
                          )
                        }
                      />
                      <span>{lang}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">City</Label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {performFilterOptions.cities.length === 0 ? (
                  <p className="px-2 py-1 text-sm text-muted-foreground">No cities in your available events.</p>
                ) : (
                  performFilterOptions.cities.map((city) => (
                    <label
                      key={city}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/80"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input"
                        checked={performFilterCities.includes(city)}
                        onChange={() =>
                          setPerformFilterCities((prev) =>
                            prev.includes(city) ? prev.filter((x) => x !== city) : [...prev, city]
                          )
                        }
                      />
                      <span>{city}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Venue</Label>
              <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-muted/30 p-2">
                {performVenueOptionsForDialog.length === 0 ? (
                  <p className="px-2 py-1 text-sm text-muted-foreground">
                    {performFilterCities.length > 0
                      ? 'No venues match the selected cities.'
                      : 'No venues in your available events.'}
                  </p>
                ) : (
                  performVenueOptionsForDialog.map((v) => (
                    <label
                      key={v.key}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/80"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 shrink-0 rounded border-input"
                        checked={performFilterVenueKeys.includes(v.key)}
                        onChange={() =>
                          setPerformFilterVenueKeys((prev) =>
                            prev.includes(v.key) ? prev.filter((x) => x !== v.key) : [...prev, v.key]
                          )
                        }
                      />
                      <span className="break-words">{v.label}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Event format</Label>
              <div className="space-y-1 rounded-md border bg-muted/30 p-2">
                {PERFORM_KIND_FILTER_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted/80"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 shrink-0 rounded border-input"
                      checked={performFilterKinds.includes(value)}
                      onChange={() =>
                        setPerformFilterKinds((prev) =>
                          prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]
                        )
                      }
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={!hasActivePerformFilters}
              onClick={() => clearPerformFilters()}
            >
              Clear all
            </Button>
            <Button type="button" onClick={() => setPerformFilterDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PushPermissionPrePrompt
        open={showPushPrePrompt}
        onEnable={handleEnablePushFromPrePrompt}
        onNotNow={handlePrePromptNotNow}
        loading={pushActionLoading}
      />
      {/* Navigation Tabs */}
<div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8 pb-28">
        {/* Role Request Status / Apply Section — only for performers who aren't community event_creators */}
        {userRole === 'performer' && !isCommunityEventCreator && (
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
              <Card className="border-yellow-400/30 bg-yellow-400/10 shadow-sm">
                <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="space-y-1">
                    <CardTitle className="text-base sm:text-lg font-semibold text-yellow-700 dark:text-yellow-400">Become an Event Creator</CardTitle>
                    <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">Create and manage your own events! Apply now.</p>
                  </div>
                  <Button asChild className="shrink-0 bg-yellow-400 text-zinc-950 hover:bg-yellow-300">
                    <Link href="/apply-event-creator">Apply Now</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {INSTALL_PROMPT_ENABLED && showInstallBanner && (
          <Card className="mb-6 border-yellow-400/30 bg-yellow-400/10 shadow-sm">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base sm:text-lg font-semibold text-yellow-700 dark:text-yellow-400">Install app for quicker access</CardTitle>
                  <p className="text-sm text-stone-600 dark:text-stone-300 mt-1">
                    Add One Mic Stand to your home screen and get 5 free credits.
                  </p>
                </div>
                <Download className="h-5 w-5 text-yellow-600 dark:text-yellow-400 shrink-0 mt-0.5" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleInstallFromBanner} disabled={installActionLoading} className="bg-yellow-400 text-zinc-950 hover:bg-yellow-300">
                  {installActionLoading ? 'Opening...' : 'Install App'}
                </Button>
                <Button variant="outline" onClick={dismissInstallBanner}>
                  Not now
                </Button>
              </div>
              {showInstallHelp && (
                <div className="rounded-md border border-yellow-400/30 bg-yellow-400/5 p-3 text-sm text-stone-700 dark:text-stone-300">
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

        {/* Perform: app title row + credits row; other tabs / audience: credits only */}
        <div className="mb-8 space-y-3">
          {userRole !== 'audience' && eventTab === 'perform' && (
            <div className="relative flex min-h-11 items-center justify-center px-10 sm:px-12">
              <span className="text-center text-lg font-bold tracking-tight text-foreground sm:text-xl">
                One Mic Stand
              </span>
              <div className="absolute right-0 top-1/2 -translate-y-1/2">
                <NotificationsBellLink />
              </div>
            </div>
          )}
          <Card className="bg-gradient-to-r from-emerald-600 to-teal-700 border-0 text-white shadow-lg w-full">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center gap-2 sm:gap-3 flex-nowrap">
                <div className="flex items-baseline gap-1.5 shrink-0">
                  <span className="text-2xl sm:text-3xl font-bold drop-shadow-md tracking-tight">{profile?.credits || 0}</span>
                  <span className="text-sm text-white/90">credits</span>
                </div>
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
                  <Link href="/credits">History</Link>
                </Button>
              </div>
              {userRole === 'audience' && (
                <p className="mt-4 text-sm text-white/90">
                  {Number(profile?.audience_free_passes_remaining || 0) > 0
                    ? `You have ${profile?.audience_free_passes_remaining || 0} free pass available.`
                    : 'No free pass remaining right now.'}
                </p>
              )}
              {activeVenueGrantCount > 0 && (
                <div className="mt-2">
                  <Link
                    href="/credits"
                    className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/25 transition-colors"
                  >
                    🏟 {activeVenueGrantCount} venue pass{activeVenueGrantCount !== 1 ? 'es' : ''}
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
          <Button
            asChild
            variant="outline"
            className="w-full justify-between h-auto py-3 px-4 border-yellow-400/40 bg-yellow-400/5 hover:bg-yellow-400/10"
          >
            <Link href="/promotions">
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-yellow-400/20">
                  <Gift className="h-4 w-4 text-yellow-700 dark:text-yellow-400" />
                </span>
                <span className="text-left min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Promotions</span>
                  <span className="block text-xs text-muted-foreground truncate">
                    Earn credits with active offers
                  </span>
                </span>
              </span>
              <ChevronDown className="h-4 w-4 -rotate-90 text-muted-foreground shrink-0" />
            </Link>
          </Button>
        </div>


        {error && (
          <Card className="border-destructive bg-destructive/15 mb-6 shadow-sm">
            <CardContent className="p-4">
              <p className="text-destructive text-sm leading-relaxed">{error}</p>
            </CardContent>
          </Card>
        )}

        {invites.length > 0 && (
          <Card className="shadow-sm mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg sm:text-xl">Event invites ({invites.length})</CardTitle>
              <CardDescription>Accept or decline invites before you book other events.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{invite.events.title}</p>
                    <p className="text-xs text-muted-foreground truncate">{formatDateTime(invite.events.date)}</p>
                    {invite.events.event_type === 'booked_show' && (invite.events.credits_required ?? 0) > 0 && (
                      <p className="text-xs text-amber-600 font-medium mt-0.5">
                        {invite.events.credits_required} credit{invite.events.credits_required !== 1 ? 's' : ''} required
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => respondToInvite(invite.id, 'accept', invite)}
                      disabled={respondingInvite === invite.id}
                    >
                      {respondingInvite === invite.id ? 'Working…' : 'Accept'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => respondToInvite(invite.id, 'decline', invite)}
                      disabled={respondingInvite === invite.id}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Available Events Section */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5 sm:mb-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Available Events</h2>
            {userRole !== 'audience' && eventTab === 'perform' && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn(
                  'relative shrink-0',
                  hasActivePerformFilters && 'border-red-500/60 bg-red-500/10 text-red-600 hover:bg-red-500/15 hover:text-red-700'
                )}
                aria-label={
                  hasActivePerformFilters ? 'Filter performer events (filters active)' : 'Filter performer events'
                }
                onClick={() => setPerformFilterDialogOpen(true)}
              >
                <Filter className="h-4 w-4" />
                {hasActivePerformFilters ? (
                  <span
                    className="pointer-events-none absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-background"
                    aria-hidden
                  />
                ) : null}
              </Button>
            )}
          </div>

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
            const now = new Date()
            const isAttendView = isAudienceUser || eventTab === 'attend'
            const isBookedOrTicketedShow = (event: Event) =>
              event.event_type === 'booked_show' ||
              (!!event.tickets_enabled && event.event_type !== 'open_mic')

            // Perform: open mics only. Attend: booked/ticketed shows + open mics.
            const filteredEvents = isAudienceUser
              ? events.filter(
                  (event) =>
                    event.event_type === 'open_mic' || isBookedOrTicketedShow(event),
                )
              : eventTab === 'perform'
                ? events.filter((event) => event.event_type === 'open_mic')
                : events.filter((event) => {
                    if (event.event_type === 'booked_show') return !invitedEventIds.has(event.id)
                    return !!event.tickets_enabled && event.event_type !== 'open_mic'
                  })

            const displayEvents =
              !isAudienceUser && eventTab === 'perform'
                ? filteredEvents.filter(eventMatchesPerformFilters)
                : filteredEvents

            const bucketOrder: Array<{ key: 'this_week' | 'next_week' | 'later'; label: string }> = [
              { key: 'this_week', label: 'This week' },
              { key: 'next_week', label: 'Next week' },
              { key: 'later', label: 'Later' },
            ]

            const sections = isAttendView
              ? [
                  {
                    key: 'shows',
                    label: 'Booked shows',
                    events: displayEvents.filter(isBookedOrTicketedShow),
                  },
                  {
                    key: 'mics',
                    label: 'Open mics',
                    events: displayEvents.filter((e) => !isBookedOrTicketedShow(e)),
                  },
                ]
              : [{ key: 'all', label: null as string | null, events: displayEvents }]

            const hiddenByPerformFilter =
              userRole !== 'audience' &&
              eventTab === 'perform' &&
              events.length > 0 &&
              filteredEvents.length === 0

            if (filteredEvents.length === 0) {
              return (
                <Card className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg">
                  <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                    <p>
                      {(userRole !== 'audience' && eventTab === 'perform')
                        ? 'No upcoming events available to perform'
                        : 'No upcoming shows available to attend'}
                    </p>
                    {events.length === 0 && (
                      <div>
                        <p className="text-xs mb-2">
                          The list is scoped to communities you belong to, with an approved event link. Join a community to see its events here.
                        </p>
                        <Link href="/communities">
                          <Button variant="outline" size="sm">Browse Communities</Button>
                        </Link>
                      </div>
                    )}
                    {hiddenByPerformFilter && (
                      <p className="text-xs text-left max-w-md mx-auto">
                        You have upcoming community events, but none match this tab&apos;s filters. Try the{' '}
                        <button
                          type="button"
                          className="underline font-medium text-foreground"
                          onClick={() => setEventTab('attend')}
                        >
                          Attend
                        </button>{' '}
                        tab for ticketed shows, or open an event from the public{' '}
                        <Link href="/events" className="underline font-medium text-foreground">
                          Events
                        </Link>{' '}
                        list.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            }

            if (displayEvents.length === 0) {
              return (
                <Card className="-mx-4 sm:mx-0 rounded-none sm:rounded-lg">
                  <CardContent className="p-8 text-center text-muted-foreground space-y-3">
                    <p>No events match your current filters.</p>
                    <Button type="button" variant="outline" size="sm" onClick={clearPerformFilters}>
                      Clear filters
                    </Button>
                  </CardContent>
                </Card>
              )
            }

            return (
              <div className="space-y-4 -mx-4 sm:mx-0 px-0">
                {sections.map((section, sectionIndex) => {
                  if (section.events.length === 0) return null
                  const eventsByBucket = {
                    this_week: section.events.filter((e) => getEventTimeBucket(new Date(e.date), now) === 'this_week'),
                    next_week: section.events.filter((e) => getEventTimeBucket(new Date(e.date), now) === 'next_week'),
                    later: section.events.filter((e) => getEventTimeBucket(new Date(e.date), now) === 'later'),
                  }
                  const showSectionDivider =
                    isAttendView &&
                    sectionIndex > 0 &&
                    sections.slice(0, sectionIndex).some((s) => s.events.length > 0)

                  return (
                    <div key={section.key} className="space-y-3">
                      {showSectionDivider && (
                        <div className="mx-4 border-t border-border" aria-hidden />
                      )}
                      {section.label && (
                        <div className="pl-4 text-base font-bold tracking-tight text-foreground">
                          {section.label}
                        </div>
                      )}
                {bucketOrder.map(({ key, label }) => {
                  const bucketEvents = eventsByBucket[key]
                  if (bucketEvents.length === 0) return null
                  return (
                    <div key={`${section.key}-${key}`} className="space-y-1.5">
                      <div className="pt-1 first:pt-0 pl-4 text-sm font-semibold text-muted-foreground">
                        {label}
                      </div>
                      <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {bucketEvents.map((event) => {
                  const isAudienceUser = userRole === 'audience'
                  const activeBooking = findActiveBookingForEvent(myBookings, event.id)
                  const hasMatchingScopeBooking =
                    !!activeBooking && bookingMatchesUserIntent(activeBooking.booking_scope, userRole)
                  const hasCrossScopeBooking =
                    !!activeBooking && !bookingMatchesUserIntent(activeBooking.booking_scope, userRole)
                  const isBooked = hasMatchingScopeBooking || optimisticBookings.has(event.id)
                  const effectiveCreditsRequired = getEffectiveCreditsRequired(event)
                  const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 0))
                  const audienceTicketCredits = Math.max(0, Number(event.credits_required || 0))
                  const audienceHasFreePass = Number(profile?.audience_free_passes_remaining || 0) > 0
                  const audienceTicketRequiredCredits =
                    event.tickets_enabled
                      ? Math.max(audienceDepositCredits, audienceTicketCredits)
                      : audienceDepositCredits
                  const creditsRequiredForCard = isAudienceUser
                    ? (audienceHasFreePass ? 0 : audienceTicketRequiredCredits)
                    : effectiveCreditsRequired
                  const hasRedeemableCredits = event.tickets_enabled && Number((event as any).audience_deposit_credits || 0) > 0
                  const showRedeemableHelpDot = hasRedeemableCredits && isAudienceUser
                  const languageSummary = formatEventLanguages(event)
                  const canAfford = canAffordWithVenueCredits(
                    profile ? getSpendableRegularCredits(profile) : 0,
                    venueCreditGrants,
                    event.venue_id,
                    creditsRequiredForCard,
                  )
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
                                <Badge variant="outline" className="text-yellow-600 border-yellow-500 whitespace-nowrap">
                                  In Progress
                                </Badge>
                              )}
                              {event.event_type !== 'booked_show' && (
                                <div className="inline-flex items-center gap-1.5">
                                  <Badge variant="secondary" className="whitespace-nowrap">
                                    {creditsRequiredForCard} Cr
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
                                      : `Deposit hold ${audienceDepositCredits} Cr`}
                                  </p>
                                )}
                                {!isAudienceUser && event.food_coupon_enabled && (
                                  <p className="text-xs text-muted-foreground">
                                    Spot fee {event.spot_fee_credits || 0} Cr + coupon ${(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100).toFixed(2)}
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
                                {hasMatchingScopeBooking && activeBooking?.id ? (
                                  <Button asChild size="sm" className="text-xs shrink-0">
                                    <Link
                                      href={`/bookings/${activeBooking.id}`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Go to booking
                                    </Link>
                                  </Button>
                                ) : hasCrossScopeBooking && activeBooking?.id ? (
                                  <div
                                    className="flex items-center gap-2 shrink-0"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Button asChild size="sm" variant="outline" className="text-xs shrink-0">
                                      <Link href={`/bookings/${activeBooking.id}`}>
                                        View {isAudienceBookingScope(activeBooking.booking_scope) ? 'audience' : 'performer'} booking
                                      </Link>
                                    </Button>
                                    {!isRegistrationOpen ? null : !canAfford ? (
                                      <Link href="/buy-credits">
                                        <Button size="sm" className="text-xs">Buy Credits</Button>
                                      </Link>
                                    ) : (
                                      <Button
                                        onClick={async (e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          setOptimisticBookings(prev => new Set(prev).add(event.id))
                                          try {
                                            await handleBookEvent(event)
                                          } catch {
                                            setOptimisticBookings(prev => {
                                              const s = new Set(prev)
                                              s.delete(event.id)
                                              return s
                                            })
                                          }
                                        }}
                                        disabled={isBooking}
                                        size="sm"
                                        className="text-xs"
                                      >
                                        {isBooking
                                          ? 'Booking...'
                                          : isFull
                                            ? 'Join Waitlist'
                                            : isAudienceUser ? 'Reserve Spot' : 'Book Event'}
                                      </Button>
                                    )}
                                  </div>
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
                                ) : !canAfford ? (
                                  <Link href="/buy-credits" onClick={(e) => e.stopPropagation()}>
                                    <Button size="sm" className="text-xs">
                                      Buy Credits
                                    </Button>
                                  </Link>
                                ) : (
                                  <Button
                                    onClick={async (e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      // Optimistic: immediately show booked state
                                      setOptimisticBookings(prev => new Set(prev).add(event.id))
                                      try {
                                        await handleBookEvent(event)
                                      } catch {
                                        // handleBookEvent already shows a toast; revert optimistic state
                                        setOptimisticBookings(prev => {
                                          const s = new Set(prev)
                                          s.delete(event.id)
                                          return s
                                        })
                                      }
                                    }}
                                    disabled={isBooking}
                                    size="sm"
                                    className="text-xs"
                                  >
                                    {isBooking 
                                      ? 'Booking...' 
                                      : isFull 
                                        ? 'Join Waitlist' 
                                        : isAudienceUser ? 'Reserve Spot' : 'Book Event'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}

                          {(event.event_type === 'booked_show' || (event.tickets_enabled && event.event_type !== 'open_mic')) && (() => {
                            const ticket = ticketByEvent[event.id]
                            const remaining = ticket ? Math.max(0, ticket.quantity - ticket.sold) : null
                            const soldOut = ticket != null && remaining === 0
                            const myTicket = myTicketsByEvent[event.id]
                            return (
                              <div className="flex items-center justify-between gap-2 pt-2 border-t">
                                <div className="text-xs text-muted-foreground">
                                  {myTicket ? (
                                    <span className="font-semibold text-sm text-foreground">
                                      🎟️ {myTicket.quantity} ticket{myTicket.quantity !== 1 ? 's' : ''}
                                    </span>
                                  ) : ticket ? (
                                    <span className="font-semibold text-sm text-foreground">
                                      ${(ticket.price_cents / 100).toFixed(2)} CAD
                                    </span>
                                  ) : event.tickets_enabled ? (
                                    <span>Tickets available</span>
                                  ) : (
                                    <span>Invite only</span>
                                  )}
                                  {!myTicket && ticket && remaining != null && remaining > 0 && remaining <= 10 && (
                                    <span className="ml-1.5 text-orange-600">· {remaining} left</span>
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
                                  {myTicket ? (
                                    <Button asChild size="sm" className="text-xs">
                                      <Link
                                        href={`/tickets/${myTicket.id}`}
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        Go to ticket
                                      </Link>
                                    </Button>
                                  ) : event.tickets_enabled && event.external_event && event.external_ticket_url ? (
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
                                  ) : soldOut ? (
                                    <Badge variant="destructive">Sold Out</Badge>
                                  ) : event.tickets_enabled ? (
                                    <Button size="sm" className="text-xs">
                                      Get Tickets
                                    </Button>
                                  ) : (
                                    isAudienceUser ? null : <Badge variant="outline">Invite only</Badge>
                                  )}
                                </div>
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                    </Link>
                  )
                })}
                      </div>
                    </div>
                  )
                })}
                    </div>
                  )
                })}
                {!isAudienceUser && eventTab === 'perform' && displayEvents.length > 0 && (
                  <div className="w-full pt-6 mt-2 border-t text-center">
                    <p className="text-sm text-muted-foreground mb-3">Want more shows? Explore communities hosting events.</p>
                    <Button asChild variant="outline" size="sm">
                      <Link href="/communities">Browse communities</Link>
                    </Button>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Create your first event CTA — shown to community event_creators who haven't created events yet */}
        {(userRole === 'event_creator' || isCommunityEventCreator) && !hasCreatedEvents && (
          <Card className="mt-6 border-emerald-200 bg-emerald-50/50 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="space-y-1">
                <CardTitle className="text-base sm:text-lg font-semibold text-emerald-900">Ready to host your first event?</CardTitle>
                <p className="text-sm text-emerald-700 leading-relaxed">
                  You&apos;re set up as an event creator. Submit your first event and the community admin will review it within 24 hours.
                </p>
              </div>
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700 shrink-0">
                <Link href="/events/manage">Create Your First Event</Link>
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}