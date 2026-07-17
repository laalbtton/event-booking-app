'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event } from '@/lib/supabase'
import { formatDateTime, formatDate, formatTime } from '@/lib/dateUtils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NotificationsBellLink } from '@/components/NotificationsBellLink'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Globe, Instagram, Pencil, Settings, Share2, Twitter, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSwipeNavigate } from '@/lib/hooks/useSwipeNavigate'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { QRCodeSVG } from 'qrcode.react'
import { getPushClientState, subscribeCurrentUserToPush, unsubscribeCurrentUserFromPush } from '@/lib/pushClient'
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

type EventBooking = {
  id: string
  event_id: string
  title: string
  date: string
  location: string
  booked_at: string
  credits_used: number
  status: string
  attendance_status: string | null
  waitlist_position: number | null
  event_status?: string | null
}

type PushNotificationPrefs = {
  user_id: string
  preprompt_dismissed_at: string | null
  preprompt_dismissed_until: string | null
  native_permission_denied_at: string | null
  subscribed_at: string | null
}

type MyCoupon = {
  id: string
  eventTitle: string
  eventDate: string | null
  code: string
  valueCents: number
  voucherType?: string
  status: 'issued' | 'redeemed' | 'cancelled' | 'expired'
  expiresAt: string | null
}

export default function ProfilePage() {
  const PUSH_REMINDER_SNOOZE_DAYS = 7
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [eventBookings, setEventBookings] = useState<EventBooking[]>([])
  const [attendedCount, setAttendedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [authAvatarUrl, setAuthAvatarUrl] = useState<string | null>(null)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeDirection, setSwipeDirection] = useState<Record<string, 'right' | 'left'>>({})
  const [instagramConnected, setInstagramConnected] = useState(false)
  const [instagramUsername, setInstagramUsername] = useState<string | null>(null)
  const [globalAutoPostEnabled, setGlobalAutoPostEnabled] = useState(false)
  const [autopostLoading, setAutopostLoading] = useState(false)
  const [autopostJobs, setAutopostJobs] = useState<any[]>([])
  const [pushPrefs, setPushPrefs] = useState<PushNotificationPrefs | null>(null)
  const [pushSupported, setPushSupported] = useState(false)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('unsupported')
  const [pushActionLoading, setPushActionLoading] = useState(false)
  const [installPlatform, setInstallPlatform] = useState<InstallPlatform>('other')
  const [installPromptAvailable, setInstallPromptAvailable] = useState(false)
  const [showInstallHelp, setShowInstallHelp] = useState(false)
  const [installActionLoading, setInstallActionLoading] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)
  const [transactionsExpanded, setTransactionsExpanded] = useState(false)
  const [privateFeedback, setPrivateFeedback] = useState<import('@/lib/supabase').ReceivedProfileReview[]>([])
  const [privateFeedbackLoaded, setPrivateFeedbackLoaded] = useState(false)
  const [privateFeedbackExpanded, setPrivateFeedbackExpanded] = useState(false)
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([])
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showRedeemedCoupons, setShowRedeemedCoupons] = useState(false)
  const [bookingsTab, setBookingsTab] = useState<'bookings' | 'coupons'>('bookings')
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)
  const [expandedPosterActions, setExpandedPosterActions] = useState<Set<string>>(new Set())
  const [profileDetailsExpanded, setProfileDetailsExpanded] = useState(false)
  const [calendarExpanded, setCalendarExpanded] = useState(false)
  const [calendarCursor, setCalendarCursor] = useState(new Date())

  const profileCalendarSwipe = useSwipeNavigate({
    onSwipeLeft: () =>
      setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1)),
    onSwipeRight: () =>
      setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1)),
    enabled: calendarExpanded,
  })
  const { confirm } = useConfirmDialog()
  const touchStartX = useRef<Record<string, number>>({})
  const touchStartY = useRef<Record<string, number>>({})
  const router = useRouter()

  const [formData, setFormData] = useState({
    full_name: '',
    bio: '',
    website_link: '',
    instagram_link: '',
    youtube_link: '',
    twitter_link: '',
    username: '',
  })
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [usernameChecking, setUsernameChecking] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      setLoading(false)
      router.push('/login')
      return
    }

    const avatar = user.user_metadata?.avatar_url || user.user_metadata?.picture || null
    setAuthAvatarUrl(avatar)
    setAvatarUrl(avatar)
    setLoading(true)
    void loadProfile(user.id)
  }, [authResolved, user, router])

  useEffect(() => {
    const state = getPushClientState()
    setPushSupported(state.supported)
    setPushPermission(state.permission)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60_000)
    return () => clearInterval(interval)
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

  // Generate initials from name
  function getInitials(name: string | null | undefined): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  function extractInstagramUsername(value: string | null | undefined): string {
    if (!value) return ''
    const trimmed = value.trim()
    if (!trimmed) return ''
    const cleaned = trimmed.replace(/^@+/, '')
    if (!cleaned.includes('/')) return cleaned
    const match = cleaned.match(/instagram\.com\/([^/?#]+)/i)
    if (match?.[1]) return match[1].replace(/^@+/, '')
    const parts = cleaned.split('/').filter(Boolean)
    return (parts[parts.length - 1] || '').replace(/^@+/, '')
  }

  function toInstagramUrl(usernameOrUrl: string | null | undefined): string | null {
    const username = extractInstagramUsername(usernameOrUrl)
    if (!username) return null
    return `https://instagram.com/${username}`
  }

  function copyPublicProfileLink() {
    if (!profile) return
    const publicUrl = `${window.location.origin}/profile/${profile.id}`
    navigator.clipboard.writeText(publicUrl)
    alert('Public profile link copied to clipboard!')
  }

  async function loadProfile(userId: string) {
    setLoading(true)
    try {
      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (profileError) throw profileError
      setProfile(profileData)

      // Prefer stored avatar_url, fallback to auth metadata
      const resolvedAvatar = profileData.avatar_url || authAvatarUrl
      setAvatarUrl(resolvedAvatar || null)

      // Persist Google avatar to profiles if missing
      if (!profileData.avatar_url && authAvatarUrl) {
        await supabase
          .from('profiles')
          .update({ avatar_url: authAvatarUrl, updated_at: new Date().toISOString() })
          .eq('id', userId)
      }
      
      // Set form data
      setFormData({
        full_name: profileData.full_name || '',
        bio: profileData.bio || '',
        website_link: profileData.website_link || '',
        instagram_link: extractInstagramUsername(profileData.instagram_link),
        youtube_link: profileData.youtube_link || '',
        twitter_link: profileData.twitter_link || '',
        username: (profileData as any).username || '',
      })

      // Load all three booking/invite datasets in parallel — all only need userId
      const [bookingsResult, bookingsFullResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, event_id, credits_used, status, attendance_status, waitlist_position, booked_at, events (id, title, date, location, status)')
          .eq('user_id', userId)
          .gt('credits_used', 0)
          .order('booked_at', { ascending: false }),
        supabase
          .from('bookings')
          .select('*, events (*)')
          .eq('user_id', userId)
          .in('status', ['confirmed', 'waitlist', 'cancelled']),
      ])

      if (bookingsResult.error) throw bookingsResult.error
      const bookingsData = bookingsResult.data || []
      const events = bookingsData.map((b: any) => ({
        id: b.id,
        event_id: b.events.id,
        title: b.events.title,
        date: b.events.date,
        location: b.events.location,
        booked_at: b.booked_at,
        credits_used: b.credits_used,
        status: b.status,
        attendance_status: b.attendance_status,
        waitlist_position: b.waitlist_position,
        event_status: b.events.status
      }))
      setEventBookings(events)
      setAttendedCount(events.filter((e: any) => e.attendance_status === 'attended').length)

      if (!bookingsFullResult.error) {
        setMyBookings(bookingsFullResult.data || [])
        // Confirmed counts depend on bookingsFullData eventIds — kept sequential
        const eventIds = [...new Set((bookingsFullResult.data || []).map((b: any) => b.event_id))]
        if (eventIds.length > 0) {
          const { data: countsData } = await supabase
            .from('bookings')
            .select('event_id, status, booking_scope')
            .in('event_id', eventIds)
            .eq('status', 'confirmed')
          if (countsData) {
            const counts: Record<string, number> = {}
            countsData.forEach((b: any) => {
              if (b.booking_scope === 'audience') return
              counts[b.event_id] = (counts[b.event_id] || 0) + 1
            })
            setEventConfirmedCounts(counts)
          }
        }
      }

      // Load coupons, push prefs, poster automation, and private feedback in parallel
      const [, pushPrefsResult, , privateFeedbackResult] = await Promise.all([
        loadMyCoupons(userId),
        supabase
          .from('push_notification_prefs')
          .select('user_id, preprompt_dismissed_at, preprompt_dismissed_until, native_permission_denied_at, subscribed_at')
          .eq('user_id', userId)
          .maybeSingle(),
        loadPosterAutomationState(userId),
        supabase.rpc('get_my_received_profile_reviews', { p_limit: 50 }),
      ])

      setPushPrefs((pushPrefsResult.data || null) as PushNotificationPrefs | null)

      const fbRaw = (privateFeedbackResult as { data?: unknown })?.data
      if (Array.isArray(fbRaw)) {
        setPrivateFeedback(fbRaw as import('@/lib/supabase').ReceivedProfileReview[])
      }
      setPrivateFeedbackLoaded(true)

    } catch (error: any) {
      console.error('Error loading profile:', error)
      alert('Error loading profile: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  async function loadMyCoupons(userId: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setMyCoupons([])
      return
    }
    const makeRequest = async (token: string) =>
      fetch('/api/vouchers/my', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
    let response = await makeRequest(accessToken)
    if (response.status === 401) {
      const retrySession = await supabase.auth.getSession()
      const retryToken = retrySession.data.session?.access_token
      if (retryToken) response = await makeRequest(retryToken)
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return
    const vouchers = Array.isArray(result.vouchers) ? result.vouchers : []
    const scoped = vouchers.filter((v: any) => v && v.id && v.code)
    setMyCoupons(
      scoped.map((v: any) => ({
        id: v.id,
        eventTitle: v.eventTitle || 'Event',
        eventDate: v.eventDate || null,
        code: v.code,
        valueCents: Number(v.valueCents || 0),
        voucherType: v.voucherType ?? 'food_coupon',
        status: v.status,
        expiresAt: v.expiresAt || null,
      }))
    )
  }

  function formatLocationValue(value: unknown): string {
    if (!value) return 'TBD'
    if (typeof value === 'string') return value
    if (typeof value === 'object' && value !== null) {
      const v = value as { name?: string; address?: string; pathname?: string }
      if (v.name && v.address) return `${v.name}, ${v.address}`
      if (v.pathname) return v.pathname
    }
    return 'TBD'
  }

  function formatVenueName(value: unknown): string {
    const location = formatLocationValue(value)
    const [name] = location.split(',')
    return name.trim() || location
  }

  function getRatingDisplay(rating: string | null | undefined): string {
    const normalized = String(rating || '18+').trim()
    const isAllAges = normalized.toLowerCase().includes('all')
    return `${isAllAges ? '👨‍👩‍👧‍👦' : '🔞'} ${normalized}`
  }

  function formatEventLanguages(event: Event | any): string {
    const langs = Array.isArray(event?.languages) ? event.languages : ['English']
    const cleaned = langs
      .map((l: string) => String(l || '').trim())
      .filter(Boolean)
      .filter((l: string, i: number, arr: string[]) => arr.findIndex((x) => x.toLowerCase() === l.toLowerCase()) === i)
    const withEnglish = cleaned.some((l: string) => l.toLowerCase() === 'english') ? cleaned : [...cleaned, 'English']
    return [...withEnglish.filter((l: string) => l.toLowerCase() !== 'english'), 'English'].join(', ')
  }

  function formatCouponStatus(status: MyCoupon['status']) {
    if (status === 'issued') return 'Issued'
    if (status === 'redeemed') return 'Redeemed'
    if (status === 'expired') return 'Expired'
    return 'Cancelled'
  }

  function copyCouponCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success('Coupon code copied!')
  }

  function copyPosterLink(url: string) {
    navigator.clipboard.writeText(url)
    toast.success('Poster link copied!')
  }

  function togglePosterActions(bookingId: string) {
    setExpandedPosterActions((prev) => {
      const next = new Set(prev)
      if (next.has(bookingId)) next.delete(bookingId)
      else next.add(bookingId)
      return next
    })
  }

  async function sharePoster(url: string, title: string) {
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `${title} poster`, text: `Check out this event poster for ${title}`, url })
        return
      }
      copyPosterLink(url)
    } catch {
      copyPosterLink(url)
    }
  }

  function renderCouponCard(coupon: MyCoupon) {
    const isLuckyDraw = coupon.voucherType === 'lucky_draw'
    const borderColor = isLuckyDraw ? 'sm:border-l-yellow-500' : 'sm:border-l-blue-500'
    return (
      <Card key={coupon.id} className={`rounded-none sm:rounded-lg border-x-0 sm:border-x border-l-0 sm:border-l-4 ${borderColor}`}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-base md:text-lg line-clamp-2">{coupon.eventTitle}</CardTitle>
              {isLuckyDraw && (
                <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-400 text-xs font-semibold">
                  🎉 Lucky Draw Winner
                </Badge>
              )}
            </div>
            <Badge
              variant="outline"
              className={cn(
                coupon.status === 'issued' && 'text-yellow-600 border-yellow-500',
                coupon.status === 'redeemed' && 'text-green-600 border-green-600',
                coupon.status === 'expired' && 'text-amber-600 border-amber-600',
                coupon.status === 'cancelled' && 'text-muted-foreground'
              )}
            >
              {formatCouponStatus(coupon.status)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLuckyDraw ? (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2 text-sm text-yellow-800">
              🍵 Show this coupon at Ryan&apos;s Chai for your free Chai!
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              {coupon.eventDate ? `📅 ${formatDateTime(coupon.eventDate)}` : '📅 Event date unavailable'}
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Code</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-foreground">{coupon.code}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => copyCouponCode(coupon.code)}
                aria-label="Copy coupon code"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {!isLuckyDraw && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Value</span>
              <span className="font-medium">${(coupon.valueCents / 100).toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Expires</span>
            <span>{coupon.expiresAt ? formatDateTime(coupon.expiresAt) : 'No expiry'}</span>
          </div>
          <div className="pt-2 border-t flex justify-center">
            <div className="bg-white p-2 rounded border">
              <QRCodeSVG value={coupon.code} size={96} />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  async function handleCancelBooking(booking: any) {
    if (!profile) return
    const event = booking.events
    const eventDate = new Date(event.date)
    const now = currentTime
    const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isBookedShow = event.event_type === 'booked_show'
    const cancellationWindow = isBookedShow ? 0 : (event.cancellation_hours || 4)
    const willGetRefund = !isBookedShow && hoursUntilEvent >= cancellationWindow
    const isAudienceBooking = booking.booking_scope === 'audience'

    let confirmMessage = ''
    if (booking.status === 'waitlist') {
      confirmMessage = isBookedShow
        ? `Remove yourself from the waitlist for "${event.title}"?`
        : isAudienceBooking && booking.credits_used === 0
          ? `Remove yourself from the waitlist for "${event.title}"?\n\nYour free audience pass will be restored.`
          : `Remove yourself from the waitlist for "${event.title}"?\n\nYou will receive a full refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
    } else {
      confirmMessage = isBookedShow
        ? `Cancel participation for "${event.title}"?`
        : willGetRefund
          ? isAudienceBooking && booking.credits_used === 0
            ? `Cancel registration for "${event.title}"?\n\nYour free audience pass will be restored.`
            : `Cancel registration for "${event.title}"?\n\nYou will receive a refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
          : `Cancel registration for "${event.title}"?\n\n⚠️ You will NOT receive a refund because cancellation is within ${cancellationWindow} hours of the event.\n\nAre you sure you want to cancel?`
    }

    const shouldProceed = await confirm({
      title: 'Confirm cancellation',
      message: confirmMessage,
      confirmText: booking.status === 'waitlist' ? 'Leave Waitlist' : 'Cancel Booking',
      cancelText: 'Keep Booking',
      variant: 'destructive',
    })
    if (!shouldProceed) return

    setCancellingBooking(booking.id)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')
      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ bookingId: booking.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to cancel booking')
      await loadProfile(profile.id)
      const refundedCredits = Number(result.refundedCredits || 0)
      const restoredFreePass = !!result.restoredFreePass
      if (restoredFreePass) {
        toast.success('Booking cancelled. Your free audience pass has been restored.')
      } else if (refundedCredits > 0) {
        const voucherNote = result.voucherRefunded ? ' Food coupon credits were also refunded.' : ''
        toast.success(
          `${booking.status === 'waitlist' ? 'Waitlist removed' : 'Booking cancelled'}. ${refundedCredits} credit${refundedCredits > 1 ? 's have' : ' has'} been refunded to your account.${voucherNote}`
        )
      } else {
        toast.info('Booking cancelled. No refund issued based on cancellation policy and voucher status.')
      }
    } catch (error: any) {
      toast.error('Error cancelling booking: ' + error.message)
    } finally {
      setCancellingBooking(null)
    }
  }

  async function loadPosterAutomationState(userId: string) {
    // Fetch social account and poster prefs in parallel
    const [socialResult, prefResult, sessionResult] = await Promise.all([
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
      supabase.auth.getSession(),
    ])

    const social = socialResult.data?.[0]
    setInstagramConnected(!!social)
    setInstagramUsername(social?.account_username || null)
    setGlobalAutoPostEnabled(!!prefResult.data?.[0]?.auto_post_enabled)

    const accessToken = sessionResult.data.session?.access_token
    if (!accessToken) {
      setAutopostJobs([])
      return
    }

    const jobsResponse = await fetch('/api/poster-autopost/jobs?mine=true', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const jobsResult = await jobsResponse.json().catch(() => ({}))
    if (jobsResponse.ok) {
      setAutopostJobs(Array.isArray(jobsResult.jobs) ? jobsResult.jobs.slice(0, 6) : [])
    }
  }

  async function handleConnectInstagram() {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/social/instagram/connect?redirect=/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.connectUrl) throw new Error(result.error || 'Failed to start OAuth')
      window.location.href = result.connectUrl
    } catch (error: any) {
      alert(error.message || 'Could not connect Instagram')
    }
  }

  async function handleDisconnectInstagram() {
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

      if (profile) await loadPosterAutomationState(profile.id)
    } catch (error: any) {
      alert(error.message || 'Could not disconnect Instagram')
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
    } catch (error: any) {
      alert(error.message || 'Could not update auto-post setting')
    } finally {
      setAutopostLoading(false)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!profile) return

    // Block save if username is invalid
    if (usernameError) return

    const usernameValue = formData.username.trim().toLowerCase() || null

    setSubmitting(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: formData.full_name,
          bio: formData.bio,
          website_link: formData.website_link || null,
          instagram_link: toInstagramUrl(formData.instagram_link),
          youtube_link: formData.youtube_link || null,
          twitter_link: formData.twitter_link || null,
          avatar_url: avatarUrl || null,
          username: usernameValue,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) {
        // Unique violation on username
        if (error.code === '23505' || error.message?.includes('profiles_username')) {
          throw new Error('That username is already taken. Please choose another.')
        }
        throw error
      }

      setIsEditing(false)
      await loadProfile(profile.id)
      toast.success('Profile updated!')
    } catch (error: any) {
      console.error('Error updating profile:', error)
      toast.error(error.message || 'Error updating profile')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAvatarUpload(file: File) {
    if (!profile) return
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const path = `${profile.id}/avatar.${ext}`

    setAvatarUploading(true)
    try {
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      // Bust cache by appending a timestamp query param
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`
      setAvatarUrl(publicUrl)
      toast.success('Photo updated — save your profile to keep it.')
    } catch (err: any) {
      console.error('Avatar upload error:', err)
      toast.error(err.message || 'Could not upload photo')
    } finally {
      setAvatarUploading(false)
    }
  }

  const USERNAME_RE = /^[a-z0-9][a-z0-9_-]*[a-z0-9]$/

  async function handleUsernameChange(value: string) {
    const v = value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
    setFormData((p) => ({ ...p, username: v }))
    setUsernameError(null)

    if (v.length === 0) return
    if (v.length < 3) { setUsernameError('Too short — minimum 3 characters'); return }
    if (v.length > 30) { setUsernameError('Too long — maximum 30 characters'); return }
    if (!USERNAME_RE.test(v)) { setUsernameError('Must start and end with a letter or number'); return }

    // Check availability (skip if unchanged from existing)
    if (v === ((profile as any)?.username ?? '').toLowerCase()) return

    setUsernameChecking(true)
    try {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', v)
        .neq('id', profile!.id)
        .maybeSingle()
      if (data) setUsernameError('That username is already taken')
    } finally {
      setUsernameChecking(false)
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
          },
          { onConflict: 'user_id' }
        )
        setPushPrefs((prev) => ({
          user_id: profile.id,
          preprompt_dismissed_at: prev?.preprompt_dismissed_at || null,
          preprompt_dismissed_until: prev?.preprompt_dismissed_until || null,
          native_permission_denied_at: nowIso,
          subscribed_at: prev?.subscribed_at || null,
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
      }))
      toast.success('Push notifications disabled')
    } catch (error: any) {
      toast.error(error?.message || 'Failed to disable push notifications')
    } finally {
      setPushActionLoading(false)
    }
  }

  async function handleDismissPushReminder() {
    if (!profile) return
    const now = new Date()
    const snoozeUntil = new Date(now.getTime() + PUSH_REMINDER_SNOOZE_DAYS * 24 * 60 * 60 * 1000)
    const nowIso = now.toISOString()
    const snoozeIso = snoozeUntil.toISOString()

    try {
      await supabase.from('push_notification_prefs').upsert(
        {
          user_id: profile.id,
          preprompt_dismissed_at: nowIso,
          preprompt_dismissed_until: snoozeIso,
          updated_at: nowIso,
        },
        { onConflict: 'user_id' }
      )

      setPushPrefs((prev) => ({
        user_id: profile.id,
        preprompt_dismissed_at: nowIso,
        preprompt_dismissed_until: snoozeIso,
        native_permission_denied_at: prev?.native_permission_denied_at || null,
        subscribed_at: prev?.subscribed_at || null,
      }))
      toast.success(`Reminder hidden for ${PUSH_REMINDER_SNOOZE_DAYS} days`)
    } catch (error) {
      console.warn('Failed to dismiss push reminder:', error)
    }
  }

  async function handleInstallFromProfile() {
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

  function handleTouchStart(e: React.TouchEvent, rowId: string) {
    touchStartX.current[rowId] = e.touches[0].clientX
    touchStartY.current[rowId] = e.touches[0].clientY
    setSwipingId(rowId)
  }

  function handleTouchMove(e: React.TouchEvent, rowId: string) {
    if (swipingId !== rowId) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const startX = touchStartX.current[rowId]
    const startY = touchStartY.current[rowId]

    const deltaX = currentX - startX
    const deltaY = Math.abs(currentY - startY)

    if (deltaY < 50) {
      if (deltaX > 0) {
        const offset = Math.min(deltaX, 100)
        setSwipeOffset(prev => ({ ...prev, [rowId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [rowId]: 'right' }))
      } else if (deltaX < 0) {
        const offset = Math.max(deltaX, -40)
        setSwipeOffset(prev => ({ ...prev, [rowId]: offset }))
        setSwipeDirection(prev => ({ ...prev, [rowId]: 'left' }))
      }
    }
  }

  function handleTouchEnd(rowId: string) {
    const offset = swipeOffset[rowId] || 0
    const direction = swipeDirection[rowId]

    if (direction === 'right' && offset > 50) {
      setTimeout(() => {
        setSwipeOffset(prev => {
          const next = { ...prev }
          delete next[rowId]
          return next
        })
        setSwipeDirection(prev => {
          const next = { ...prev }
          delete next[rowId]
          return next
        })
        setSwipingId(null)
      }, 2000)
    } else {
      setSwipeOffset(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setSwipeDirection(prev => {
        const next = { ...prev }
        delete next[rowId]
        return next
      })
      setSwipingId(null)
    }

    touchStartX.current[rowId] = 0
    touchStartY.current[rowId] = 0
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-20 w-20 rounded-full mx-auto" />
              <Skeleton className="h-8 w-3/4 mx-auto" />
              <Skeleton className="h-4 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Profile not found</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const pushEnabled = !!pushPrefs?.subscribed_at || pushPermission === 'granted'
  const pushReminderSnoozed =
    !!pushPrefs?.preprompt_dismissed_until &&
    new Date(pushPrefs.preprompt_dismissed_until).getTime() > Date.now()
  const shouldShowPushReminder =
    pushSupported &&
    !pushEnabled &&
    pushPermission !== 'denied' &&
    !pushReminderSnoozed
  const calendarMonth = calendarCursor.getMonth()
  const calendarYear = calendarCursor.getFullYear()
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()
  const startWeekday = firstDay.getDay()
  const monthLabel = firstDay.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const upcomingBookingDateKeys = new Set(
    myBookings
      .filter((b) => {
        const eventDate = new Date(b.events.date)
        return eventDate >= currentTime && b.status !== 'cancelled' && b.events?.status !== 'cancelled'
      })
      .map((b) => {
        const d = new Date(b.events.date)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      })
  )
  const pastBookingDateKeys = new Set(
    myBookings
      .filter((b) => {
        const eventDate = new Date(b.events.date)
        return eventDate < currentTime && b.status !== 'cancelled' && b.events?.status !== 'cancelled'
      })
      .map((b) => {
        const d = new Date(b.events.date)
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      })
  )
  const calendarCells: Array<number | null> = []
  for (let i = 0; i < startWeekday; i += 1) calendarCells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) calendarCells.push(day)

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="max-w-4xl mx-auto px-0 py-4 sm:py-8 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-[45] -mx-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 pt-[env(safe-area-inset-top,0px)] mb-3 sm:mb-4 rounded-none sm:rounded-lg overflow-hidden sm:border sm:border-border sm:shadow-sm">
          <div className="flex items-center justify-between gap-2 px-4 sm:px-4 min-h-12">
            <p className="text-base sm:text-lg font-semibold tracking-tight truncate min-w-0 pr-2">
              {(profile.full_name || '').trim() || 'Account'}
            </p>
            <div className="flex items-center gap-1 shrink-0">
              <Button onClick={copyPublicProfileLink} variant="ghost" size="icon" className="h-10 w-10" title="Share Profile">
                <Share2 className="h-5 w-5" />
              </Button>
              <Button onClick={() => setIsEditing(true)} variant="ghost" size="icon" className="h-10 w-10" title="Edit Profile">
                <Pencil className="h-5 w-5" />
              </Button>
              <NotificationsBellLink size="lg" />
              <Button variant="ghost" size="icon" className="h-10 w-10" title="Settings" asChild>
                <Link href="/settings">
                  <Settings className="w-5 h-5" />
                </Link>
              </Button>
            </div>
          </div>
        </header>
        {/* Profile Card */}
        <Card className="mb-0 shadow-sm rounded-none sm:rounded-lg">
          <CardContent className="p-6 sm:p-8">
          {!isEditing ? (
            <>
            <div className="flex items-start gap-4 sm:gap-6 mb-6">
              {/* Profile Picture */}
              <Avatar className="w-20 h-20 sm:w-24 sm:h-24 border-2 border-border">
                <AvatarImage src={avatarUrl || undefined} alt={profile.full_name || 'Profile'} />
                <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-2xl font-bold">
                  {getInitials(profile.full_name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                {/* Name lives in sticky app header; email is shown under Settings → Account */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Credits:</span>
                      <span className="text-lg sm:text-xl font-bold text-primary">{profile.credits}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-muted-foreground">Attended:</span>
                      <span className="text-lg sm:text-xl font-bold text-green-600">{attendedCount}</span>
                    </div>
                  </div>
                  {shouldShowPushReminder && (
                    <p className="text-xs text-muted-foreground">
                      Notifications are not enabled yet. Enable them from <Link href="/settings" className="underline underline-offset-2">Settings</Link>.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {(profile.bio || profile.website_link || profile.instagram_link || profile.youtube_link || profile.twitter_link) && (
              <div className="mb-0">
                <button
                  type="button"
                  className="w-full flex items-center justify-between py-1"
                  onClick={() => setProfileDetailsExpanded((prev) => !prev)}
                >
                  <span className="text-sm font-semibold tracking-tight">Bio & links</span>
                  <ChevronDown className={cn('h-4 w-4 transition-transform', profileDetailsExpanded && 'rotate-180')} />
                </button>
                {profileDetailsExpanded && (
                  <div className="pt-3 space-y-4">
                    {profile.bio && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{profile.bio}</p>
                    )}
                    {(profile.website_link || profile.instagram_link || profile.youtube_link || profile.twitter_link) && (
                      <div className="flex flex-wrap gap-2">
                        {profile.website_link && (
                          <Button variant="outline" size="icon" className="h-9 w-9" asChild>
                            <a href={profile.website_link} target="_blank" rel="noopener noreferrer" aria-label="Website">
                              <Globe className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                        {profile.instagram_link && (
                          <Button variant="outline" size="sm" className="bg-pink-50 hover:bg-pink-100 border-pink-200" asChild>
                            <a href={profile.instagram_link} target="_blank" rel="noopener noreferrer">
                              <Instagram className="h-4 w-4 mr-1" /> Instagram
                            </a>
                          </Button>
                        )}
                        {profile.youtube_link && (
                          <Button variant="outline" size="sm" className="bg-red-50 hover:bg-red-100 border-red-200" asChild>
                            <a href={profile.youtube_link} target="_blank" rel="noopener noreferrer">
                              <Youtube className="h-4 w-4 mr-1" /> YouTube
                            </a>
                          </Button>
                        )}
                        {profile.twitter_link && (
                          <Button variant="outline" size="sm" className="bg-sky-50 hover:bg-sky-100 border-sky-200" asChild>
                            <a href={profile.twitter_link} target="_blank" rel="noopener noreferrer">
                              <Twitter className="h-4 w-4 mr-1" /> Twitter
                            </a>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            </>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">Edit Profile</CardTitle>
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false)
                      setUsernameError(null)
                      setFormData({
                        full_name: profile.full_name || '',
                        bio: profile.bio || '',
                        website_link: profile.website_link || '',
                        instagram_link: extractInstagramUsername(profile.instagram_link),
                        youtube_link: profile.youtube_link || '',
                        twitter_link: profile.twitter_link || '',
                        username: (profile as any).username || '',
                      })
                    }}
                    className="flex-1 sm:flex-initial"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 sm:flex-initial"
                  >
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>

              {/* ── Avatar upload ───────────────────────────────────── */}
              <div className="space-y-2.5">
                <Label className="text-sm font-semibold">Profile Photo</Label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="shrink-0">
                    {avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarUrl}
                        alt="Avatar preview"
                        className="h-16 w-16 rounded-full object-cover border-2 border-border"
                      />
                    ) : (
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground border-2 border-border">
                        {getInitials(profile?.full_name || formData.full_name)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 flex-1">
                    <label
                      htmlFor="avatar-upload"
                      className={[
                        'inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        avatarUploading
                          ? 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground border-border'
                          : 'border-border hover:bg-muted text-foreground',
                      ].join(' ')}
                    >
                      {avatarUploading ? 'Uploading…' : 'Upload photo'}
                    </label>
                    <input
                      id="avatar-upload"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      disabled={avatarUploading}
                      className="sr-only"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleAvatarUpload(file)
                      }}
                    />
                    <p className="text-xs text-muted-foreground">JPEG, PNG, WebP or GIF · max 5 MB</p>
                  </div>
                </div>
              </div>

              {/* ── Full Name ────────────────────────────────────────── */}
              <div className="space-y-2.5">
                <Label htmlFor="fullName" className="text-sm font-semibold">
                  Full Name *
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  required
                  className="h-11"
                />
              </div>

              {/* ── Username ─────────────────────────────────────────── */}
              <div className="space-y-2.5">
                <Label htmlFor="username" className="text-sm font-semibold">
                  Username
                  <span className="ml-1 text-xs font-normal text-muted-foreground">(optional)</span>
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                    app.laalbutton.com/profile/
                  </span>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleUsernameChange(e.target.value)}
                    placeholder="yourname"
                    className="h-11 pl-[calc(theme(spacing.3)+theme(spacing.3)+14ch)] font-mono"
                    maxLength={30}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {usernameChecking && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      checking…
                    </span>
                  )}
                </div>
                {usernameError ? (
                  <p className="text-xs text-red-500">{usernameError}</p>
                ) : formData.username.length >= 3 ? (
                  <p className="text-xs text-green-600">
                    Your profile URL:{' '}
                    <span className="font-mono">app.laalbutton.com/profile/{formData.username}</span>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    3–30 characters · letters, numbers, hyphens and underscores only
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="bio" className="text-sm font-semibold">
                  Bio
                </Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  rows={4}
                  placeholder="Tell us about yourself..."
                />
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="website" className="text-sm font-semibold">
                  Website
                </Label>
                <Input
                  id="website"
                  type="url"
                  value={formData.website_link}
                  onChange={(e) => setFormData({ ...formData, website_link: e.target.value })}
                  placeholder="https://example.com"
                  className="h-11"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2.5">
                  <Label htmlFor="instagram" className="text-sm font-semibold">
                    Instagram username
                  </Label>
                  <Input
                    id="instagram"
                    type="text"
                    value={formData.instagram_link}
                    onChange={(e) => setFormData({ ...formData, instagram_link: e.target.value })}
                    placeholder="@username"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter only the username. We save the full Instagram link automatically.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="youtube" className="text-sm font-semibold">
                    YouTube
                  </Label>
                  <Input
                    id="youtube"
                    type="url"
                    value={formData.youtube_link}
                    onChange={(e) => setFormData({ ...formData, youtube_link: e.target.value })}
                    placeholder="https://youtube.com/@username"
                    className="h-11"
                  />
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="twitter" className="text-sm font-semibold">
                    Twitter
                  </Label>
                  <Input
                    id="twitter"
                    type="url"
                    value={formData.twitter_link}
                    onChange={(e) => setFormData({ ...formData, twitter_link: e.target.value })}
                    placeholder="https://twitter.com/username"
                    className="h-11"
                  />
                </div>
              </div>
            </form>
          )}
          </CardContent>
        </Card>

        <Card className="mb-0 shadow-sm rounded-none sm:rounded-lg">
          <CardHeader className="px-6 py-[1.2rem] sm:px-6 sm:py-[1.2rem]">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setCalendarExpanded((prev) => !prev)}
            >
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }}
                  title="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <CardTitle className="text-sm font-medium tracking-normal min-w-[160px] text-center">
                  {monthLabel}
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }}
                  title="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <ChevronDown className={cn('h-4 w-4 transition-transform', calendarExpanded && 'rotate-180')} />
            </button>
          </CardHeader>
          {calendarExpanded && (
            <CardContent
              className="p-4 sm:p-6 pt-0"
              aria-label="Bookings calendar — swipe left or right to change month"
            >
              <div
                onTouchStart={profileCalendarSwipe.onTouchStart}
                onTouchEnd={profileCalendarSwipe.onTouchEnd}
                className={cn(profileCalendarSwipe.className, 'select-none')}
              >
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarCells.map((day, idx) => {
                  if (!day) return <div key={`blank-${idx}`} className="h-8" />
                  const dateKey = `${calendarYear}-${calendarMonth}-${day}`
                  const hasUpcomingBooking = upcomingBookingDateKeys.has(dateKey)
                  const hasPastBooking = pastBookingDateKeys.has(dateKey)
                  return (
                    <div
                      key={dateKey}
                      className={cn(
                        'h-8 rounded-sm flex items-center justify-center text-xs',
                        hasUpcomingBooking ? 'text-red-600 font-bold' : 'text-muted-foreground',
                        hasPastBooking && 'underline underline-offset-2'
                      )}
                    >
                      {day}
                    </div>
                  )
                })}
              </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* My Bookings - always visible, no dropdown, full-bleed on mobile */}
        <Card className="shadow-sm rounded-none sm:rounded-lg">
          <CardContent className="p-4 sm:p-6">
            <Tabs value={bookingsTab} onValueChange={(v) => setBookingsTab(v as typeof bookingsTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="bookings">Bookings</TabsTrigger>
                <TabsTrigger value="coupons">Coupons</TabsTrigger>
              </TabsList>
              <TabsContent value="bookings" className="pt-4">
                  {(() => {
                    const activeUpcomingBookings = myBookings.filter(
                      (b) =>
                        new Date(b.events.date) >= currentTime &&
                        b.status !== 'cancelled' &&
                        b.events.status !== 'cancelled'
                    )
                    if (activeUpcomingBookings.length === 0) {
                      return (
                        <Card>
                          <CardContent className="p-8 text-center text-muted-foreground">
                            No upcoming bookings yet.
                          </CardContent>
                        </Card>
                      )
                    }
                    return (
                      <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 -mx-4 sm:mx-0 px-0">
                        {activeUpcomingBookings.map((booking) => {
                          const eventDate = new Date(booking.events.date)
                          const now = currentTime
                          const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
                          const isBookedShow = booking.events.event_type === 'booked_show'
                          const cancellationWindow = isBookedShow ? 0 : (booking.events.cancellation_hours || 4)
                          const canCancel = hoursUntilEvent >= 0 && booking.events.status !== 'cancelled'
                          const willGetRefund = !isBookedShow && hoursUntilEvent >= cancellationWindow
                          const diffMs = eventDate.getTime() - now.getTime()
                          const isPast = diffMs < 0
                          let timeDisplay = ''
                          if (!isPast) {
                            const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                            const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                            const parts = []
                            if (days > 0) parts.push(`${days}d`)
                            if (hours > 0 || days > 0) parts.push(`${hours}h`)
                            if (days === 0) parts.push(`${minutes}m`)
                            timeDisplay = parts.join(' ') || '0m'
                          }
                          const refundDeadline = new Date(eventDate.getTime() - cancellationWindow * 60 * 60 * 1000)
                          const refundDiffMs = refundDeadline.getTime() - now.getTime()
                          let refundTimeDisplay = ''
                          if (refundDiffMs > 0) {
                            const days = Math.floor(refundDiffMs / (1000 * 60 * 60 * 24))
                            const hours = Math.floor((refundDiffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                            const minutes = Math.floor((refundDiffMs % (1000 * 60 * 60)) / (1000 * 60))
                            const parts = []
                            if (days > 0) parts.push(`${days}d`)
                            if (hours > 0 || days > 0) parts.push(`${hours}h`)
                            if (days === 0) parts.push(`${minutes}m`)
                            refundTimeDisplay = parts.join(' ') || '0m'
                          }
                          const isWaitlist = booking.status === 'waitlist'
                          const isEventCancelled = booking.events.status === 'cancelled'
                          const isAudienceBooking = booking.booking_scope === 'audience'
                          const confirmedCount = eventConfirmedCounts[booking.event_id] || 0
                          const spotsLeft = booking.events.max_attendees != null
                            ? booking.events.max_attendees - confirmedCount
                            : null
                          return (
                            <Link key={booking.id} href={`/events/${booking.event_id}`} className="block active:opacity-90">
                              <Card
                                className={cn(
                                  'hover:border-primary/60 hover:shadow-sm transition-all active:bg-muted/40 rounded-none sm:rounded-lg border-x-0 sm:border-x border-l-0 sm:border-l-4',
                                  isEventCancelled ? 'sm:border-l-red-500' : isWaitlist ? 'sm:border-l-yellow-500' : 'sm:border-l-green-500'
                                )}
                              >
                                <CardHeader className="pb-3">
                                  <div className="flex justify-between items-start">
                                    <CardTitle className="text-base md:text-lg flex-1">{booking.events.title}</CardTitle>
                                    {!isPast &&
                                      (isEventCancelled ? (
                                        <Badge variant="destructive" className="ml-2">Cancelled</Badge>
                                      ) : isWaitlist ? (
                                        <Badge variant="outline" className="text-yellow-600 border-yellow-600 ml-2">
                                          ⏳ #{booking.waitlist_position}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-green-600 border-green-600 ml-2">✓</Badge>
                                      ))}
                                  </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                  <p className="text-xs text-muted-foreground line-clamp-1 break-words whitespace-normal">
                                    {booking.events.description}
                                  </p>
                                  <div className="text-xs text-muted-foreground">
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-1">
                                        <span>📅</span>
                                        <span>{formatDateTime(booking.events.date)}</span>
                                      </div>
                                      {booking.events.max_attendees != null && spotsLeft != null && (
                                        <div className="whitespace-nowrap">
                                          👥 {spotsLeft} / {booking.events.max_attendees} spots left
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                      <div className="flex items-center gap-1">
                                        <span>📍</span>
                                        <span>{formatVenueName(booking.events.location)}</span>
                                      </div>
                                      <div className="whitespace-nowrap">
                                        {booking.events.theme ? `🎨 ${booking.events.theme}` : ''}
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 min-w-0">
                                      <div className="min-w-0 flex-1 pr-2 text-xs text-muted-foreground truncate">
                                        🗣️ {formatEventLanguages(booking.events)}
                                      </div>
                                      <div className="whitespace-nowrap shrink-0 text-[11px] sm:text-xs">
                                        {getRatingDisplay(booking.events.rating)}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1 text-muted-foreground">
                                      <span>💳</span>
                                      {isBookedShow ? (
                                        <span>Invite only</span>
                                      ) : isAudienceBooking ? (
                                        booking.credits_used > 0 ? (
                                          <span>Deposit held: {booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                                        ) : (
                                          <span>Free pass used</span>
                                        )
                                      ) : (
                                        <span>{booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                                      )}
                                    </div>
                                    {!isPast ? (
                                      <Badge variant="secondary" className="text-xs">⏰ In {timeDisplay}</Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">✓ Completed</Badge>
                                    )}
                                  </div>
                                  {isAudienceBooking && booking.audience_checkin_code && (
                                    <div className="text-xs text-muted-foreground rounded-md border bg-muted/30 px-2 py-1">
                                      Check-in code: <span className="font-medium text-foreground">{booking.audience_checkin_code}</span>
                                    </div>
                                  )}
                                  {isAudienceBooking && (
                                    <p className="text-xs text-muted-foreground">Not marked attended? You can request a review soon.</p>
                                  )}
                                  {canCancel && (
                                    <div className="space-y-2 pt-2 border-t">
                                      <Button
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          handleCancelBooking(booking)
                                        }}
                                        disabled={cancellingBooking === booking.id}
                                        variant="destructive"
                                        size="sm"
                                        className="w-full"
                                      >
                                        {cancellingBooking === booking.id
                                          ? 'Cancelling...'
                                          : isWaitlist
                                            ? 'Leave Waitlist'
                                            : 'Cancel Booking'}
                                      </Button>
                                      {!isBookedShow && (
                                        <p className="text-xs text-muted-foreground text-center">
                                          {isWaitlist
                                            ? '✓ Full refund if you leave waitlist'
                                            : willGetRefund
                                              ? `✓ Full refund available (${refundTimeDisplay} left)`
                                              : `⚠️ No refund (within ${cancellationWindow}h window)`}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {booking.events.poster_url && (
                                    <div className="space-y-2 pt-2 border-t">
                                      <button
                                        type="button"
                                        className="w-full flex items-center justify-between text-xs text-muted-foreground"
                                        onClick={(e) => {
                                          e.preventDefault()
                                          e.stopPropagation()
                                          togglePosterActions(booking.id)
                                        }}
                                      >
                                        <span>Poster available</span>
                                        <ChevronDown className={cn('h-4 w-4 transition-transform', expandedPosterActions.has(booking.id) && 'rotate-180')} />
                                      </button>
                                      {expandedPosterActions.has(booking.id) && (
                                        <div className="flex flex-wrap gap-2">
                                          <a href={booking.events.poster_url} target="_blank" rel="noreferrer" download onClick={(e) => e.stopPropagation()}>
                                            <Button size="sm" variant="outline" className="text-xs">Download Poster</Button>
                                          </a>
                                          <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); copyPosterLink(booking.events.poster_url) }}>
                                            Copy Poster Link
                                          </Button>
                                          <Button size="sm" variant="outline" className="text-xs" onClick={(e) => { e.preventDefault(); e.stopPropagation(); sharePoster(booking.events.poster_url, booking.events.title) }}>
                                            Share Poster
                                          </Button>
                                        </div>
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
                </TabsContent>
              <TabsContent value="coupons" className="pt-4">
                {myCoupons.length === 0 ? (
                  <Card>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      No coupons issued yet.
                    </CardContent>
                  </Card>
                ) : (
                  (() => {
                    const activeCoupons = myCoupons.filter((c) => c.status === 'issued')
                    const redeemedCoupons = myCoupons.filter((c) => c.status === 'redeemed')
                    const otherCoupons = myCoupons.filter((c) => c.status !== 'issued' && c.status !== 'redeemed')
                    return (
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-foreground">Active coupons</p>
                          {activeCoupons.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No active coupons.</p>
                          ) : (
                            <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 -mx-4 sm:mx-0 px-0">
                              {activeCoupons.map((c) => renderCouponCard(c))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-3 border-t pt-4">
                          <button
                            type="button"
                            className="w-full flex items-center justify-between text-sm font-semibold"
                            onClick={() => setShowRedeemedCoupons((p) => !p)}
                          >
                            <span>Redeemed coupons ({redeemedCoupons.length})</span>
                            <ChevronDown className={cn('h-4 w-4 transition-transform', showRedeemedCoupons && 'rotate-180')} />
                          </button>
                          {showRedeemedCoupons && (
                            <>
                              {redeemedCoupons.length === 0 ? (
                                <p className="text-sm text-muted-foreground">No redeemed coupons.</p>
                              ) : (
                                <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 -mx-4 sm:mx-0 px-0">
                                  {redeemedCoupons.map((c) => renderCouponCard(c))}
                                </div>
                              )}
                                {otherCoupons.length > 0 && (
                                  <div className="space-y-3 border-t pt-4">
                                    <p className="text-sm font-semibold text-muted-foreground">
                                      Expired / cancelled coupons ({otherCoupons.length})
                                    </p>
                                    <div className="grid gap-0 sm:gap-4 md:grid-cols-2 lg:grid-cols-3 -mx-4 sm:mx-0 px-0">
                                      {otherCoupons.map((c) => renderCouponCard(c))}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })()
                )}
              </TabsContent>
            </Tabs>
            {(() => {
              const activeUpcomingBookings = myBookings.filter(
                (b) =>
                  new Date(b.events.date) >= currentTime &&
                  b.status !== 'cancelled' &&
                  b.events.status !== 'cancelled'
              )
              return activeUpcomingBookings.length === 0 && myCoupons.length === 0 && (
                <div className="pt-4 text-center">
                  <Button variant="link" asChild>
                    <Link href="/dashboard">Browse Events →</Link>
                  </Button>
                </div>
              )
            })()}
          </CardContent>
        </Card>

        {/* ── Private Feedback (anonymous reviews received) ─────────── */}
        {privateFeedbackLoaded && (
          <Card className="shadow-sm rounded-none sm:rounded-lg">
            <CardHeader
              className="cursor-pointer p-4 sm:p-6"
              onClick={() => setPrivateFeedbackExpanded((p) => !p)}
            >
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                    Private Feedback
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Anonymous reviews only you can see
                    {privateFeedback.length > 0 && ` · ${privateFeedback.length} review${privateFeedback.length === 1 ? '' : 's'}`}
                  </CardDescription>
                </div>
                <ChevronDown
                  className={cn('h-5 w-5 text-muted-foreground transition-transform', privateFeedbackExpanded && 'rotate-180')}
                />
              </div>
            </CardHeader>

            {privateFeedbackExpanded && (
              <CardContent className="p-4 sm:p-6 pt-0 space-y-4">
                {privateFeedback.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No anonymous feedback yet.
                  </p>
                ) : (
                  privateFeedback.map((rev) => (
                    <div
                      key={rev.id}
                      className="rounded-xl border border-border bg-muted/40 px-4 py-4 space-y-2"
                    >
                      {/* Rating row */}
                      <div className="flex items-center gap-2">
                        {rev.isAnonymous ? (
                          <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            Anonymous
                          </span>
                        ) : (
                          <div className="flex items-center gap-2">
                            {rev.reviewerAvatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={rev.reviewerAvatar}
                                alt={rev.reviewerName ?? ''}
                                className="h-6 w-6 rounded-full object-cover"
                              />
                            ) : (
                              <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                                {(rev.reviewerName ?? '?')[0]?.toUpperCase()}
                              </div>
                            )}
                            <span className="text-sm font-medium">{rev.reviewerName ?? 'Unknown'}</span>
                          </div>
                        )}
                        <span className="ml-auto text-yellow-500 text-sm">
                          {'★'.repeat(rev.rating)}
                          <span className="text-muted-foreground">{'★'.repeat(5 - rev.rating)}</span>
                        </span>
                      </div>

                      {rev.comment && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{rev.comment}</p>
                      )}

                      <p className="text-xs text-muted-foreground">
                        {rev.eventTitle && <span>{rev.eventTitle} · </span>}
                        {new Date(rev.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* My Transactions - collapsible at bottom, full-bleed on mobile */}
        <Card className="shadow-sm rounded-none sm:rounded-lg">
          <CardHeader className="cursor-pointer p-4 sm:p-6" onClick={() => setTransactionsExpanded((p) => !p)}>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">My Transactions</CardTitle>
              <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', transactionsExpanded && 'rotate-180')} />
            </div>
          </CardHeader>
          {transactionsExpanded && (
            <CardContent className="p-4 sm:p-6 pt-0">
              {eventBookings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">No recent activity.</p>
              ) : (
                (() => {
                  const rows = eventBookings.map((booking) => {
                    const isEventCancelled = booking.status === 'cancelled' && booking.event_status === 'cancelled'
                    const activity = isEventCancelled
                      ? 'Event cancelled'
                      : booking.status === 'cancelled'
                        ? 'Cancelled'
                        : 'Booked'
                    const activityDate = booking.booked_at
                    const displayAmount = activity === 'Booked' ? -booking.credits_used : booking.credits_used
                    return { ...booking, activity, activityDate, displayAmount }
                  })
                  rows.sort((a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime())
                  const formatActivityDate = (value: string) =>
                    new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  const grouped = rows.reduce((acc: Record<string, typeof rows>, row) => {
                    const key = formatActivityDate(row.activityDate)
                    if (!acc[key]) acc[key] = []
                    acc[key].push(row)
                    return acc
                  }, {})
                  const orderedDates: string[] = []
                  rows.forEach((row) => {
                    const key = formatActivityDate(row.activityDate)
                    if (!orderedDates.includes(key)) orderedDates.push(key)
                  })
                  return (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-border text-sm">
                        <tbody className="divide-y divide-border">
                          {orderedDates.flatMap((groupDate) => [
                            <tr key={`${groupDate}-header`}>
                              <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                                {groupDate}
                              </td>
                            </tr>,
                            ...(grouped[groupDate] || []).map((row) => (
                              <tr
                                key={row.id}
                                className="hover:bg-muted/30"
                                style={{ transform: `translateX(${swipeOffset[row.id] || 0}px)` }}
                                onTouchStart={(e) => handleTouchStart(e, row.id)}
                                onTouchMove={(e) => handleTouchMove(e, row.id)}
                                onTouchEnd={() => handleTouchEnd(row.id)}
                              >
                                <td className="px-4 py-3">
                                  <div className="font-medium text-foreground truncate max-w-[220px] sm:max-w-[320px]">
                                    <Link href={`/events/${row.event_id}`} className="hover:underline">{row.title}</Link>
                                  </div>
                                  <div className="text-xs text-muted-foreground">{row.activity}</div>
                                </td>
                                <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                                  {new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground">
                                  <div className="text-sm">{row.displayAmount > 0 ? '+' : ''}{row.displayAmount}</div>
                                  {swipeDirection[row.id] === 'right' && (swipeOffset[row.id] || 0) > 50 && (
                                    <div className="text-xs text-muted-foreground mt-1">{formatTime(row.activityDate)}</div>
                                  )}
                                </td>
                              </tr>
                            )),
                          ])}
                        </tbody>
                      </table>
                    </div>
                  )
                })()
              )}
            </CardContent>
          )}
        </Card>

      </div>
    </div>
  )
}
