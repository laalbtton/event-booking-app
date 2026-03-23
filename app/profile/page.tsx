'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event } from '@/lib/supabase'
import { formatDateTime, formatDate, formatTime } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
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
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Globe, Instagram, Pencil, Settings, Share2, Twitter, Youtube } from 'lucide-react'
import { cn } from '@/lib/utils'
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

type InviteItem = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  created_at: string
  events: {
    id: string
    title: string
    date: string
    location: string | null
    credits_required: number | null
    event_type: string | null
  }
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
  status: 'issued' | 'redeemed' | 'cancelled' | 'expired'
  expiresAt: string | null
}

export default function ProfilePage() {
  const PUSH_REMINDER_SNOOZE_DAYS = 7
  const { authResolved, user } = useAuthBootstrap()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [eventBookings, setEventBookings] = useState<EventBooking[]>([])
  const [invites, setInvites] = useState<InviteItem[]>([])
  const [respondingInvite, setRespondingInvite] = useState<string | null>(null)
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
  const [invitesExpanded, setInvitesExpanded] = useState(true)
  const [transactionsExpanded, setTransactionsExpanded] = useState(false)
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([])
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showRedeemedCoupons, setShowRedeemedCoupons] = useState(false)
  const [bookingsTab, setBookingsTab] = useState<'bookings' | 'coupons'>('bookings')
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)
  const [expandedPosterActions, setExpandedPosterActions] = useState<Set<string>>(new Set())
  const [profileDetailsExpanded, setProfileDetailsExpanded] = useState(false)
  const [calendarExpanded, setCalendarExpanded] = useState(true)
  const [calendarCursor, setCalendarCursor] = useState(new Date())
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
    twitter_link: ''
  })

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
        twitter_link: profileData.twitter_link || ''
      })

      // Load all three booking/invite datasets in parallel — all only need userId
      const [bookingsResult, invitesResult, bookingsFullResult] = await Promise.all([
        supabase
          .from('bookings')
          .select('id, event_id, credits_used, status, attendance_status, waitlist_position, booked_at, events (id, title, date, location, status)')
          .eq('user_id', userId)
          .gt('credits_used', 0)
          .order('booked_at', { ascending: false }),
        supabase
          .from('event_invites')
          .select('id, status, created_at, events (id, title, date, location, credits_required, event_type)')
          .eq('invited_user_id', userId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
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

      if (!invitesResult.error) setInvites(invitesResult.data as any)

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

      // Load coupons, push prefs, and poster automation in parallel
      const [, pushPrefsResult] = await Promise.all([
        loadMyCoupons(userId),
        supabase
          .from('push_notification_prefs')
          .select('user_id, preprompt_dismissed_at, preprompt_dismissed_until, native_permission_denied_at, subscribed_at')
          .eq('user_id', userId)
          .maybeSingle(),
        loadPosterAutomationState(userId),
      ])

      setPushPrefs((pushPrefsResult.data || null) as PushNotificationPrefs | null)

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
    return (
      <Card key={coupon.id} className="rounded-none sm:rounded-lg border-x-0 sm:border-x border-l-0 sm:border-l-4 sm:border-l-blue-500">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base md:text-lg line-clamp-2">{coupon.eventTitle}</CardTitle>
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
          <div className="text-sm text-muted-foreground">
            {coupon.eventDate ? `📅 ${formatDateTime(coupon.eventDate)}` : '📅 Event date unavailable'}
          </div>
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
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Value</span>
            <span className="font-medium">${(coupon.valueCents / 100).toFixed(2)}</span>
          </div>
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
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (error) throw error

      setIsEditing(false)
      await loadProfile(profile.id)
      alert('Profile updated successfully!')
    } catch (error: any) {
      console.error('Error updating profile:', error)
      alert('Error updating profile: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function respondToInvite(inviteId: string, action: 'accept' | 'decline', invite?: InviteItem) {
    // Show credit charge confirmation for booked shows with a non-zero credit cost
    if (action === 'accept' && invite) {
      const creditsRequired = invite.events.credits_required ?? 0
      const isBookedShow = invite.events.event_type === 'booked_show'
      if (isBookedShow && creditsRequired > 0) {
        const shouldProceed = await confirm({
          title: 'Confirm acceptance',
          message: `Accepting this invite will charge you ${creditsRequired} credit${creditsRequired !== 1 ? 's' : ''}.\n\nOnly proceed if you are okay with this charge.`,
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
        await loadProfile(profile.id)
      }
    } catch (error: any) {
      console.error('Error responding to invite:', error)
      alert('Error responding to invite: ' + error.message)
    } finally {
      setRespondingInvite(null)
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
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="mb-2">
          <div className="flex items-center justify-end gap-1">
            <Button onClick={copyPublicProfileLink} variant="ghost" size="icon" className="h-8 w-8" title="Share Profile">
              <Share2 className="h-4 w-4" />
            </Button>
            <Button onClick={() => setIsEditing(true)} variant="ghost" size="icon" className="h-8 w-8" title="Edit Profile">
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Settings" asChild>
              <Link href="/settings">
                <Settings className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
        {/* Profile Card */}
        <Card className="mb-6 shadow-sm">
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
                <div className="mb-4">
                  <div className="min-w-0">
                    <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-1 truncate">
                      {profile.full_name || 'No name set'}
                    </h2>
                    <p className="text-sm text-muted-foreground truncate">{profile.email}</p>
                  </div>
                </div>

                {/* Consolidated Stats - Horizontal Layout */}
                <div className="flex flex-col gap-2 pt-4 border-t">
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
              <div className="mb-5">
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
                      setFormData({
                        full_name: profile.full_name || '',
                        bio: profile.bio || '',
                        website_link: profile.website_link || '',
                        instagram_link: extractInstagramUsername(profile.instagram_link),
                        youtube_link: profile.youtube_link || '',
                        twitter_link: profile.twitter_link || ''
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

        {/* My Invites - only when invites exist */}
        {invites.length > 0 && (
          <Card className="shadow-sm -mx-4 sm:mx-0 rounded-none sm:rounded-lg">
            <CardHeader className="cursor-pointer p-4 sm:p-6" onClick={() => setInvitesExpanded((p) => !p)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight">
                    My Invites{invites.filter((i) => i.status === 'pending').length > 0 ? ` (${invites.filter((i) => i.status === 'pending').length})` : ''}
                  </CardTitle>
                </div>
                <ChevronDown className={cn('h-5 w-5 text-muted-foreground transition-transform', invitesExpanded && 'rotate-180')} />
              </div>
            </CardHeader>
            {invitesExpanded && (
              <CardContent className="p-4 sm:p-6 pt-0">
                <div className="space-y-3">
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invite.events.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{formatDate(invite.events.date)}</p>
                        {invite.events.event_type === 'booked_show' && (invite.events.credits_required ?? 0) > 0 && (
                          <p className="text-xs text-amber-600 font-medium mt-0.5">
                            {invite.events.credits_required} credit{invite.events.credits_required !== 1 ? 's' : ''} required
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => respondToInvite(invite.id, 'accept', invite)}
                          disabled={respondingInvite === invite.id}
                        >
                          Accept
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
                </div>
              </CardContent>
            )}
          </Card>
        )}

        <Card className="mb-6 shadow-sm -mx-4 sm:mx-0 rounded-none sm:rounded-lg">
          <CardHeader className="p-4 sm:p-6">
            <button
              type="button"
              className="w-full flex items-center justify-between"
              onClick={() => setCalendarExpanded((prev) => !prev)}
            >
              <CardTitle className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                {monthLabel}
              </CardTitle>
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', calendarExpanded && 'rotate-180')} />
            </button>
            {calendarExpanded && (
              <div className="mt-3 flex items-center justify-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  title="Previous month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setCalendarCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  title="Next month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardHeader>
          {calendarExpanded && (
            <CardContent className="p-4 sm:p-6 pt-0">
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
            </CardContent>
          )}
        </Card>

        {/* My Bookings - always visible, no dropdown, full-bleed on mobile */}
        <Card className="shadow-sm -mx-4 sm:mx-0 rounded-none sm:rounded-lg">
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

        {/* My Transactions - collapsible at bottom, full-bleed on mobile */}
        <Card className="shadow-sm -mx-4 sm:mx-0 rounded-none sm:rounded-lg">
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
