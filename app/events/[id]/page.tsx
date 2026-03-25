'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import { sendBookingConfirmationEmail } from '@/lib/emailService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { cn } from '@/lib/utils'
import { Bell, BellOff, ChevronLeft, ChevronDown, ChevronUp, Copy, Instagram, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ExpandableEventDescription } from '@/components/public/ExpandableEventDescription'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import EventChat from '@/components/EventChat'


type EventDetails = {
  id: string
  title: string
  description: string
  theme: string | null
  rating: string | null
  status?: string | null
  event_type: 'open_mic' | 'booked_show'
  open_mic_type?: 'comedy_open_mic' | 'variety_arts_open_mic' | null
  variety_use_max_attendees?: boolean
  is_multilingual?: boolean
  languages?: string[]
  tickets_enabled: boolean
  external_event: boolean
  external_ticket_url: string | null
  poster_url: string | null
  poster_caption: string | null
  poster_updated_at: string | null
  date: string
  end_time: string | null
  location: string
  venue_id: string | null
  credits_required: number
  food_coupon_enabled?: boolean
  spot_fee_credits?: number
  food_coupon_value_cents?: number
  no_show_penalty_enabled?: boolean | null
  no_show_penalty_credits?: number | null
  max_attendees: number | null
  cancellation_hours: number
  registration_opens_at: string | null
  host_user_id: string | null
  created_by: string | null
  audience_expected_count?: number
}

type VenueDetails = {
  id: string
  name: string
  address: string
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  drinks_available?: boolean
}

type AttendeeBooking = {
  id: string
  status: string
  waitlist_position: number | null
  event_art_type_id?: string | null
  profiles: {
    id: string
    full_name: string
    email: string
    avatar_url?: string | null
    instagram_link?: string | null
  }
}

type VarietyArtOption = {
  id: string
  name: string
  capacity: number
  confirmedCount: number
  waitlistCount: number
}

export default function EventDetailsPage() {
  const { confirm } = useConfirmDialog()
  const { authResolved, user: authBootstrapUser } = useAuthBootstrap()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [confirmedBookings, setConfirmedBookings] = useState<AttendeeBooking[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<AttendeeBooking[]>([])
  const [copyInstagramHandlesEnabled, setCopyInstagramHandlesEnabled] = useState(false)
  const [audienceExpectedCount, setAudienceExpectedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [userBooking, setUserBooking] = useState<any>(null)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [settingAlert, setSettingAlert] = useState(false)
  const [alertSet, setAlertSet] = useState(false)
  const [error, setError] = useState('')
  const [hostProfile, setHostProfile] = useState<{ full_name: string } | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [isEventCreator, setIsEventCreator] = useState(false)
  const [venue, setVenue] = useState<VenueDetails | null>(null)
  const [venueOpen, setVenueOpen] = useState(false)
  const [eventAutoPostEnabled, setEventAutoPostEnabled] = useState(false)
  const [prefLoading, setPrefLoading] = useState(false)
  const [varietyDialogOpen, setVarietyDialogOpen] = useState(false)
  const [varietyOptions, setVarietyOptions] = useState<VarietyArtOption[]>([])
  const [selectedVarietyOptionId, setSelectedVarietyOptionId] = useState('')
  const [posterExpanded, setPosterExpanded] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [chatNotifEnabled, setChatNotifEnabled] = useState(true)


  function copyPublicLink() {
    const publicUrl = `${window.location.origin}/events/${(event as any)?.slug || eventId}`
    navigator.clipboard.writeText(publicUrl)
    toast.success('Public link copied to clipboard!')
  }

  function copyAttendeeList() {
    const confirmed = confirmedBookings.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}${getBookingArtTypeLabel(booking) ? ` (${getBookingArtTypeLabel(booking)})` : ''}`
    )
    const waitlist = waitlistBookings.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}${getBookingArtTypeLabel(booking) ? ` (${getBookingArtTypeLabel(booking)})` : ''}`
    )

    let text = `Confirmed Attendees (${confirmed.length})\n${confirmed.join('\n') || 'None'}`
    if (waitlist.length > 0) {
      text += `\n\nWaitlist (${waitlist.length})\n${waitlist.join('\n')}`
    }

    navigator.clipboard.writeText(text)
    toast.success('Attendee list copied!')
  }

  function extractInstagramUsername(instagramLink: string | null | undefined): string | null {
    const raw = (instagramLink || '').trim()
    if (!raw) return null

    // If stored as "@username"
    if (raw.startsWith('@')) {
      const u = raw.slice(1).trim()
      return u || null
    }

    // If stored as username only
    if (/^[A-Za-z0-9._]{1,30}$/.test(raw)) return raw

    // Common URL forms: https://www.instagram.com/username/ or instagram.com/username
    const urlMatch = raw.match(/instagram\.com\/(?:@)?([^\/\?\#\s]+)/i)
    if (urlMatch?.[1]) return urlMatch[1]

    try {
      const url = new URL(raw)
      const parts = (url.pathname || '').split('/').filter(Boolean)
      if (parts.length > 0) {
        const first = parts[0].replace(/^@/, '')
        return first || null
      }
    } catch {
      // Ignore parse errors; fall back to regex above.
    }

    return null
  }

  function copyPerformerInstagramHandles() {
    const confirmed = Array.from(
      new Set(
        confirmedBookings
          .map((booking) => extractInstagramUsername(booking.profiles.instagram_link))
          .filter(Boolean)
      )
    ) as string[]

    const waitlist = Array.from(
      new Set(
        waitlistBookings
          .map((booking) => extractInstagramUsername(booking.profiles.instagram_link))
          .filter(Boolean)
      )
    ) as string[]

    const confirmedLines = confirmed.map((u) => `@${u}`)
    const waitlistLines = waitlist.map((u) => `@${u}`)

    let text = `Confirmed Performers (${confirmedLines.length})\n${confirmedLines.join('\n') || 'None'}`
    if (waitlistLines.length > 0) {
      text += `\n\nWaitlist Performers (${waitlistLines.length})\n${waitlistLines.join('\n')}`
    }

    navigator.clipboard.writeText(text)
    toast.success('Instagram handles copied!')
  }

  function copyPosterLink() {
    if (!event?.poster_url) return
    navigator.clipboard.writeText(event.poster_url)
    toast.success('Poster link copied!')
  }

  function formatEventLanguages() {
    const langs = Array.isArray((event as any)?.languages) ? (event as any).languages.filter(Boolean) : ['English']
    const resolved = langs.length > 0 ? langs : ['English']
    const isMulti = !!(event as any)?.is_multilingual || resolved.length > 1
    return isMulti ? `Multilingual: ${resolved.join(', ')}` : (resolved[0] || 'English')
  }

  function getRatingDisplay(rating: string | null | undefined): string {
    const normalized = String(rating || '18+').trim()
    const isAllAges = normalized.toLowerCase().includes('all')
    return `${isAllAges ? '👨‍👩‍👧‍👦' : '🔞'} ${normalized}`
  }

  function getEffectiveNoShowPenalty(eventData: EventDetails): { enabled: boolean; credits: number } {
    const defaultEnabled = Number(eventData.credits_required || 0) <= 0
    const enabled = eventData.no_show_penalty_enabled ?? defaultEnabled
    const credits = Math.max(0, Number(eventData.no_show_penalty_credits ?? 5))
    return { enabled, credits }
  }

  /** Signed up on this event as a performer (confirmed or waitlist); excludes audience bookings. */
  const isPerformerSignedUpForEvent =
    !!userBooking &&
    ['confirmed', 'waitlist'].includes(userBooking.status) &&
    userBooking.booking_scope !== 'audience'

  /** Read chat: platform performers, hosts, or performer signup on this event (event_creator/admin need no booking). */
  const canReadEventChat =
    isHost ||
    isEventCreator ||
    profile?.role === 'event_creator' ||
    profile?.role === 'admin' ||
    isPerformerSignedUpForEvent

  /** Send chat: host/creator or confirmed (not waitlist) non-audience signup; EventChat + API enforce host_only vs open. */
  const canSendChatMessages =
    isHost ||
    isEventCreator ||
    (!!userBooking &&
      userBooking.status === 'confirmed' &&
      userBooking.booking_scope !== 'audience')

  function getBookingArtTypeLabel(booking: AttendeeBooking): string | null {
    if (!event || event.event_type !== 'open_mic' || (event as any).open_mic_type !== 'variety_arts_open_mic') return null
    if (!booking.event_art_type_id) return null
    const match = varietyOptions.find((option) => option.id === booking.event_art_type_id)
    return match?.name || null
  }

  async function sharePoster() {
    if (!event?.poster_url) return
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: `${event.title} poster`,
          text: event.poster_caption || `Check out this event poster for ${event.title}`,
          url: event.poster_url,
        })
        return
      }
      copyPosterLink()
    } catch {
      copyPosterLink()
    }
  }

  async function toggleEventAutoPost(enabled: boolean) {
    try {
      setPrefLoading(true)
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/poster-autopost/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId, enabled }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to update preference')
      setEventAutoPostEnabled(enabled)
    } catch (error: any) {
      toast.error(error.message || 'Could not update poster auto-post preference')
    } finally {
      setPrefLoading(false)
    }
  }

  useEffect(() => {
    loadEventDetails()
  }, [eventId])

  useEffect(() => {
    const chatOn = !!(event as any)?.chat_enabled
    const userId = currentUser?.id
    if (!chatOn || !userId || !eventId) return
    let cancelled = false
    ;(async () => {
      const { data: pref } = await supabase
        .from('event_chat_notification_prefs')
        .select('enabled')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .maybeSingle()
      if (!cancelled && pref != null) {
        setChatNotifEnabled(!!pref.enabled)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [eventId, currentUser?.id, event, (event as any)?.chat_enabled])

  async function toggleChatNotif() {
    const next = !chatNotifEnabled
    setChatNotifEnabled(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      await fetch(`/api/events/${eventId}/chat/notification-pref`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: next }),
      })
    } catch (err) {
      console.error('chat notif pref error:', err)
      setChatNotifEnabled(!next)
    }
  }

  useEffect(() => {
    // Default OFF (matches settings). Preference is stored on-device.
    const key = 'copy_instagram_handles_enabled'
    const val = window.localStorage.getItem(key)
    setCopyInstagramHandlesEnabled(val === '1')
  }, [])

  async function loadEventDetails() {
    setLoading(true)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (!user) {
        setProfile(null)
        setUserBooking(null)
        setEventAutoPostEnabled(false)
        setAlertSet(false)
      } else {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (profileData) setProfile(profileData)
      }

      // Load event details by id first, then fallback to slug.
      let { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .maybeSingle()
      if (!eventData) {
        const fallback = await supabase
          .from('events')
          .select('*')
          .eq('slug', eventId)
          .maybeSingle()
        eventData = fallback.data
        eventError = fallback.error
      }
      if (eventError || !eventData) throw eventError || new Error('Event not found')
      setEvent(eventData)
      const resolvedEventId = eventData.id as string
      if ((eventData as any).slug && eventId !== (eventData as any).slug) {
        router.replace(`/events/${(eventData as any).slug}`)
      }

      // Check if current user is the host / creator
      if (user && eventData.host_user_id === user.id) setIsHost(true)
      if (user && eventData.created_by === user.id) setIsEventCreator(true)

      const isVariety =
        eventData.event_type === 'open_mic' &&
        (eventData as any).open_mic_type === 'variety_arts_open_mic'

      // Fire all event-level queries in parallel — none depend on each other
      const [
        venueResult,
        hostResult,
        confirmedResult,
        waitlistResult,
        audienceCountResult,
        artTypesResult,
      ] = await Promise.all([
        eventData.venue_id
          ? supabase
              .from('venues')
              .select('id, name, address, parking_options, accessibility, food_drinks_available, drinks_available')
              .eq('id', eventData.venue_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
        eventData.host_user_id
          ? supabase
              .from('profiles')
              .select('full_name')
              .eq('id', eventData.host_user_id)
              .single()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('bookings')
          .select('id, status, booking_scope, event_art_type_id, waitlist_position, profiles (id, full_name, email, avatar_url, instagram_link)')
          .eq('event_id', resolvedEventId)
          .eq('status', 'confirmed')
          .order('booked_at', { ascending: true }),
        supabase
          .from('bookings')
          .select('id, status, booking_scope, event_art_type_id, waitlist_position, profiles (id, full_name, email, avatar_url, instagram_link)')
          .eq('event_id', resolvedEventId)
          .eq('status', 'waitlist')
          .order('waitlist_position', { ascending: true }),
        supabase
          .from('bookings')
          .select('id', { count: 'exact', head: true })
          .eq('event_id', resolvedEventId)
          .eq('booking_scope', 'audience')
          .in('status', ['confirmed', 'waitlist']),
        isVariety
          ? supabase
              .from('event_art_types')
              .select('id, art_type_name, slot_capacity')
              .eq('event_id', resolvedEventId)
              .order('created_at', { ascending: true })
          : Promise.resolve({ data: null, error: null }),
      ])

      if (!venueResult.error && venueResult.data) setVenue(venueResult.data as VenueDetails)
      if (!hostResult.error && hostResult.data) setHostProfile(hostResult.data)

      if (confirmedResult.error) throw confirmedResult.error
      const confirmedData = confirmedResult.data || []
      const performerConfirmed = confirmedData.filter((b: any) => b.booking_scope !== 'audience')
      setConfirmedBookings(performerConfirmed as any)

      if (waitlistResult.error) throw waitlistResult.error
      const waitlistData = waitlistResult.data || []
      const performerWaitlist = waitlistData.filter((b: any) => b.booking_scope !== 'audience')
      setWaitlistBookings(performerWaitlist as any)

      setAudienceExpectedCount(audienceCountResult.count || 0)

      if (isVariety && artTypesResult.data) {
        const options = artTypesResult.data.map((row: any) => {
          const confirmedCount = confirmedData.filter(
            (b: any) => b.booking_scope !== 'audience' && b.event_art_type_id === row.id
          ).length
          const waitlistCount = waitlistData.filter(
            (b: any) => b.booking_scope !== 'audience' && b.event_art_type_id === row.id
          ).length
          return {
            id: row.id,
            name: row.art_type_name,
            capacity: Number(row.slot_capacity || 0),
            confirmedCount,
            waitlistCount,
          } satisfies VarietyArtOption
        })
        setVarietyOptions(options)
        setSelectedVarietyOptionId(options[0]?.id || '')
      } else {
        setVarietyOptions([])
        setSelectedVarietyOptionId('')
      }

      // User-specific rows — all three only need user.id + resolvedEventId
      if (user) {
        const [userBookingResult, prefResult, alertResult] = await Promise.all([
          supabase
            .from('bookings')
            .select('id, status, booking_scope')
            .eq('event_id', resolvedEventId)
            .eq('user_id', user.id)
            .in('status', ['confirmed', 'waitlist'])
            .order('booked_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('poster_auto_post_prefs')
            .select('auto_post_enabled')
            .eq('user_id', user.id)
            .eq('event_id', resolvedEventId)
            .maybeSingle(),
          supabase
            .from('registration_alerts')
            .select('id')
            .eq('user_id', user.id)
            .eq('event_id', resolvedEventId)
            .maybeSingle(),
        ])

        setUserBooking(userBookingResult.data || null)
        setEventAutoPostEnabled(!!prefResult.data?.auto_post_enabled)

        if (alertResult.error) {
          const missingTable = alertResult.error.code === '42P01' || alertResult.error.message?.includes('registration_alerts')
          if (!missingTable) console.warn('Error loading registration alert:', alertResult.error)
          setAlertSet(false)
        } else {
          setAlertSet(!!alertResult.data)
        }
      }
    } catch (error: any) {
      console.error('Error loading event details:', error)
      toast.error('Error loading event details')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetAlert() {
    if (!profile) return
    setSettingAlert(true)
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
        body: JSON.stringify({ eventId: event?.id ?? eventId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to set alert')
      }

      setAlertSet(true)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSettingAlert(false)
    }
  }

  async function handleBookEvent(eventData: EventDetails, selectedArtTypeId?: string) {
    if (!profile) return

    setBookingLoading(true)
    setError('')

    try {
      if (eventData.tickets_enabled && eventData.event_type !== 'open_mic') {
        throw new Error('This event uses external tickets')
      }
      if (eventData.event_type === 'booked_show') {
        throw new Error('This show is invite-only')
      }
      if (eventData.status === 'cancelled') {
        throw new Error('This event has been cancelled')
      }

      if (eventData.registration_opens_at) {
        const registrationOpensAt = new Date(eventData.registration_opens_at)
        const now = new Date()
        if (now < registrationOpensAt) {
          throw new Error(`Registration opens on ${formatDateTime(registrationOpensAt)}`)
        }
      }

      if (userBooking) {
        throw new Error('You have already booked this event')
      }

      if (
        profile?.role !== 'audience' &&
        eventData.event_type === 'open_mic' &&
        (eventData as any).open_mic_type === 'variety_arts_open_mic' &&
        !selectedArtTypeId
      ) {
        if (!varietyOptions.length) {
          throw new Error('This variety event has no configured art type slots.')
        }
        setVarietyDialogOpen(true)
        return
      }

      const now = new Date()
      const eventStart = new Date(eventData.date)
      const hoursUntilEvent = (eventStart.getTime() - now.getTime()) / (1000 * 60 * 60)
      const cancellationWindow = eventData.cancellation_hours || 4
      const inNoRefundWindow = hoursUntilEvent < cancellationWindow
      const isFullAtConfirmation =
        eventData.max_attendees !== null && confirmedBookings.length >= eventData.max_attendees
      const performerFreeSpot = profile.role !== 'audience' && (
        eventData.food_coupon_enabled
          ? Math.max(0, Number(eventData.spot_fee_credits || 0)) +
            Math.ceil(Math.max(0, Number(eventData.food_coupon_value_cents || 0)) / 100)
          : Number(eventData.credits_required || 0)
      ) <= 0
      const noShowPenalty = getEffectiveNoShowPenalty(eventData)
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

      const isAudienceUser = profile.role === 'audience'
      const audienceDepositCredits = Math.max(0, Number((eventData as any).audience_deposit_credits || 1))
      const audienceHasFreePass = Number(profile.audience_free_passes_remaining || 0) > 0
      const effectiveCreditsRequired = isAudienceUser
        ? (audienceHasFreePass ? 0 : audienceDepositCredits)
        : (eventData.food_coupon_enabled
          ? Math.max(0, Number(eventData.spot_fee_credits || 0)) +
            Math.ceil(Math.max(0, Number(eventData.food_coupon_value_cents || 0)) / 100)
          : eventData.credits_required)

      if (Number(profile.credits || 0) < effectiveCreditsRequired) {
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
        body: JSON.stringify({ eventId: eventData.id, eventArtTypeId: selectedArtTypeId || null }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to create booking')
      }

      if (result.bookingStatus === 'confirmed' && result.bookingId) {
        sendBookingConfirmationEmail(profile.id, result.bookingId, eventData.id).catch((emailError) => {
          console.warn('Failed to send booking confirmation email:', emailError)
        })
      }

      await loadEventDetails()

      if (result.bookingStatus === 'waitlist') {
        toast.success('Event is full. You have been added to the waitlist.')
      } else if (result.voucher) {
        toast.success(`Event booked successfully! Food coupon issued: ${result.voucher.code}`)
      } else {
        toast.success('Event booked successfully!')
      }
    } catch (error: any) {
      setError(error.message)
      toast.error(error.message)
    } finally {
      setBookingLoading(false)
    }
  }

  // While loading: logged-out visitors rely on the layout's public summary.
  // Logged-in users should still see bottom nav (fixes blank shell during fetch; slug URLs load longer).
  if (loading && authResolved && (authBootstrapUser || currentUser)) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center gap-2 bg-gray-50 dark:bg-background pb-28 text-muted-foreground">
          <p>Loading event…</p>
        </div>
</>
    )
  }
  if (loading) return null

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
          <Link href="/dashboard" className="flex items-center gap-2 text-blue-600 hover:underline">
            <ChevronLeft className="w-5 h-5" />
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  // Logged-out visitors are served by the layout's LayoutEventSummary (public view).
  // Returning null here prevents the authenticated page shell from rendering on top of it.
  if (!currentUser) return null

  const spotsAvailable = event.max_attendees 
    ? event.max_attendees - confirmedBookings.length 
    : null
  const isRegistrationOpen = !event.registration_opens_at || new Date() >= new Date(event.registration_opens_at)
  const isFull = event.max_attendees !== null && confirmedBookings.length >= event.max_attendees
  const isAlreadyBooked =
    !!userBooking && (userBooking.status === 'confirmed' || userBooking.status === 'waitlist')
  const isAudienceUser = profile?.role === 'audience'
  const audienceDepositCredits = Math.max(0, Number((event as any).audience_deposit_credits || 1))
  const audienceHasFreePass = Number(profile?.audience_free_passes_remaining || 0) > 0
  const creditsRequiredForButton = isAudienceUser
    ? (audienceHasFreePass ? 0 : audienceDepositCredits)
    : (event.food_coupon_enabled
      ? Math.max(0, Number(event.spot_fee_credits || 0)) +
        Math.ceil(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100)
      : event.credits_required)
  const canAfford = Number(profile?.credits || 0) >= creditsRequiredForButton
  const bookingLabel = isFull ? 'Join Waitlist' : isAudienceUser ? 'Reserve Spot' : 'Book Event'
  const now = new Date()
  const startTime = new Date(event.date)
  const endTime = event.end_time
    ? new Date(event.end_time)
    : new Date(new Date(event.date).getTime() + 2 * 60 * 60 * 1000)
  const isInProgress = startTime <= now && now < endTime
  const useGlobalVarietyCapacity =
    event.event_type === 'open_mic' &&
    (event as any).open_mic_type === 'variety_arts_open_mic' &&
    !!(event as any).variety_use_max_attendees

  return (
    <div className={cn('min-h-screen bg-gray-50 dark:bg-background', userBooking ? 'pb-28' : 'pb-20')}>
      <Dialog open={varietyDialogOpen} onOpenChange={setVarietyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select your art type</DialogTitle>
            <DialogDescription>
              Choose the performance bucket you want to book for this variety arts open mic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {varietyOptions.map((option) => {
              const spotsLeft = Math.max(0, option.capacity - option.confirmedCount)
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
              disabled={!selectedVarietyOptionId}
              onClick={async () => {
                if (!event || !selectedVarietyOptionId) return
                setVarietyDialogOpen(false)
                await handleBookEvent(event, selectedVarietyOptionId)
              }}
            >
              Continue Booking
            </Button>
            <Button className="flex-1" variant="outline" onClick={() => setVarietyDialogOpen(false)}>
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>
        {/* Header */}
        <div className="bg-white dark:bg-card shadow border-b border-transparent dark:border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <Link
                href="/dashboard"
                className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 p-1 -ml-1 rounded hover:bg-gray-100 dark:hover:bg-muted"
                aria-label="Back to Dashboard"
              >
                <ChevronLeft className="w-5 h-5" />
              </Link>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-foreground">Event Details</h1>
            </div>
        </div>
        </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="-mx-4 sm:mx-0">
        {/* Poster Section - at top, collapsible caption + buttons */}
        {event.poster_url && (
          <Card className="mb-6 rounded-none sm:rounded-lg border-x-0 sm:border-x">
            <CardContent className="p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={event.poster_url}
                alt={`${event.title} poster`}
                className="w-full max-h-[500px] object-contain rounded border bg-muted/30"
              />
              <button
                type="button"
                onClick={() => setPosterExpanded((prev) => !prev)}
                className="w-full flex items-center justify-center gap-2 py-2 hover:bg-muted/50 transition-colors rounded-lg mt-2"
                aria-label={posterExpanded ? 'Hide caption and actions' : 'Show caption and actions'}
              >
                {posterExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>
              {posterExpanded && (
                <div className="space-y-3 pt-2">
                  {event.poster_caption && (
                    <p className="text-sm text-muted-foreground">{event.poster_caption}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <a href={event.poster_url} target="_blank" rel="noreferrer" download>
                      <Button variant="outline" size="sm">Download</Button>
                    </a>
                    <Button variant="outline" size="sm" onClick={copyPosterLink}>Copy Link</Button>
                    <Button variant="outline" size="sm" onClick={sharePoster}>Share</Button>
                    {(userBooking || isHost || isEventCreator) && (
                      <Button
                        variant={eventAutoPostEnabled ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => toggleEventAutoPost(!eventAutoPostEnabled)}
                        disabled={prefLoading}
                      >
                        {eventAutoPostEnabled ? 'Auto-post On' : 'Enable Auto-post'}
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {(event as any).chat_enabled && currentUser && canReadEventChat && (
          <Card className="mb-6 rounded-none sm:rounded-lg border-x-0 sm:border-x">
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="flex-1 gap-2"
                  onClick={() => setShowChat(true)}
                >
                  <MessageCircle className="w-4 h-4" />
                  Open Event Chat
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  onClick={toggleChatNotif}
                  aria-label={chatNotifEnabled ? 'Turn off chat notifications' : 'Turn on chat notifications'}
                  title={chatNotifEnabled ? 'Chat notifications on' : 'Chat notifications off'}
                >
                  {chatNotifEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Event Info Card */}
        <Card className="mb-6 rounded-none sm:rounded-lg border-x-0 sm:border-x">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">{event.title}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">
              {getRatingDisplay(event.rating)}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <ExpandableEventDescription
              text={event.description}
              collapsedLines={4}
              textClassName="text-base md:text-lg text-muted-foreground whitespace-pre-wrap"
            />

            <div className="flex flex-wrap gap-2">
              {event.theme && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                  🎨 Theme: {event.theme}
                </Badge>
              )}
              <Badge variant="outline">
                🗣️ {formatEventLanguages()}
              </Badge>
              {isInProgress && (
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  In Progress
                </Badge>
              )}

              {hostProfile && (
                <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                  👤 Host: {hostProfile.full_name}
                </Badge>
              )}

              {event.host_user_id && !hostProfile && (
                <Badge variant="secondary">
                  👤 Host: TBD
                </Badge>
              )}
            </div>

            <div className="space-y-2 mb-4">
                <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                  <span className="mr-2">📅</span>
                  <span>{formatDateTime(event.date)}</span>
                </div>

                <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                  <span className="mr-2">📍</span>
                  {venue ? (
                    <button
                      type="button"
                      onClick={() => setVenueOpen(true)}
                      className="text-blue-700 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 underline underline-offset-2"
                    >
                      {venue.name}
                    </button>
                  ) : (
                    <span>{event.location}</span>
                  )}
                </div>

                <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                  <span className="mr-2">💳</span>
                  {event.event_type === 'booked_show' ? (
                    <span><strong className="font-semibold">Type:</strong> Invite only</span>
                  ) : event.tickets_enabled ? (
                    <span><strong className="font-semibold">Tickets:</strong> {event.external_event ? 'External' : 'Available'}</span>
                  ) : event.food_coupon_enabled ? (
                    <span>
                      <strong className="font-semibold">Cost:</strong>{' '}
                      {Math.max(0, Number(event.spot_fee_credits || 0)) + Math.ceil(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100)} credits
                      {' '}({Math.max(0, Number(event.spot_fee_credits || 0))} spot + ${(
                        Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100
                      ).toFixed(2)} coupon)
                    </span>
                  ) : (
                    <span><strong className="font-semibold">Cost:</strong> {event.credits_required} credit{event.credits_required !== 1 ? 's' : ''}</span>
                  )}
                </div>

                {!isRegistrationOpen && event.registration_opens_at && (
                  <div className="flex items-center text-sm md:text-base text-orange-700 dark:text-orange-400">
                    <span className="mr-2">⏰</span>
                    <span>Registration opens {formatDateTime(event.registration_opens_at)}</span>
                  </div>
                )}

                {event.max_attendees ? (
                  <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                    <span className="mr-2">👥</span>
                    <span>{confirmedBookings.length} / {event.max_attendees} confirmed
                      {spotsAvailable !== null && spotsAvailable > 0 && (
                        <span className="text-green-600 dark:text-green-400 ml-2">
                          ({spotsAvailable} spot{spotsAvailable !== 1 ? 's' : ''} left)
                        </span>
                      )}
                      {spotsAvailable === 0 && (
                        <span className="text-red-600 dark:text-red-400 ml-2">(FULL)</span>
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                    <span className="mr-2">👥</span>
                    <span>{confirmedBookings.length} registered (Unlimited)</span>
                  </div>
                )}

                {audienceExpectedCount >= 5 && (
                  <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                    <span className="mr-2">🧑‍🤝‍🧑</span>
                    <span>Expected audience: {audienceExpectedCount}</span>
                  </div>
                )}

                {event.event_type === 'open_mic' && (event as any).open_mic_type === 'variety_arts_open_mic' && varietyOptions.length > 0 && (
                  <div className="text-sm md:text-base text-gray-900 dark:text-foreground">
                    <span className="mr-2">🎭</span>
                    <span>
                      {useGlobalVarietyCapacity
                        ? varietyOptions.map((option) => option.name).join(' · ')
                        : varietyOptions.map((option) => `${option.name}: ${Math.max(0, option.capacity - option.confirmedCount)} left`).join(' · ')}
                    </span>
                  </div>
                )}

                {event.event_type !== 'booked_show' && !event.tickets_enabled && (
                  <div className="flex items-center text-sm md:text-base text-gray-900 dark:text-foreground">
                    <span className="mr-2">⏱️</span>
                    <span>Cancel up to {event.cancellation_hours}h before for full refund</span>
                  </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={copyPublicLink}
                  size="sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  Share
                </Button>
                {(isHost || isEventCreator) && (
                  <Button asChild variant="default" className="bg-green-600 hover:bg-green-700">
                    <Link href={`/events/${event.id}/attendance`}>
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      Manage Attendees
                    </Link>
                  </Button>
                )}
              </div>
              {profile && (
                event.status === 'cancelled' ? (
                  <Badge variant="destructive">Cancelled</Badge>
                ) : event.tickets_enabled && event.external_event && event.external_ticket_url ? (
                  <a href={event.external_ticket_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline">Buy Tickets</Button>
                  </a>
                ) : event.event_type === 'booked_show' ? (
                  <Badge variant="outline">Invite only</Badge>
                ) : !isRegistrationOpen ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-600 border-orange-600">
                      Not Open
                    </Badge>
                    <Button
                      variant="outline"
                      onClick={handleSetAlert}
                      disabled={settingAlert || alertSet}
                      size="sm"
                    >
                      {alertSet ? 'Alert Set' : settingAlert ? 'Setting...' : 'Alert Me'}
                    </Button>
                  </div>
                ) : isAlreadyBooked && userBooking?.id ? (
                  <Button asChild size="sm" variant="default">
                    <Link href={`/bookings/${userBooking.id}`}>Go to booking</Link>
                  </Button>
                ) : !canAfford ? (
                  <Link href="/buy-credits">
                    <Button size="sm">Buy Credits</Button>
                  </Link>
                ) : (
                  <Button
                    onClick={() => handleBookEvent(event)}
                    disabled={bookingLoading}
                    size="sm"
                  >
                    {bookingLoading ? 'Booking...' : bookingLabel}
                  </Button>
                )
              )}
            </div>

            {waitlistBookings.length > 0 && (
              <p className="text-sm md:text-base text-muted-foreground">⏳ {waitlistBookings.length} on waitlist</p>
            )}
          </CardContent>
        </Card>

        {/* Confirmed Attendees */}
        <Card className="mb-6 rounded-none sm:rounded-lg border-x-0 sm:border-x">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg md:text-xl">
              Confirmed Attendees ({confirmedBookings.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={copyAttendeeList}
                aria-label="Copy attendee list"
              >
                <Copy className="h-4 w-4" />
              </Button>
              {copyInstagramHandlesEnabled && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyPerformerInstagramHandles}
                  aria-label="Copy performer Instagram handles"
                >
                  <span className="relative inline-flex items-center justify-center">
                    <Copy className="h-4 w-4" />
                    <Instagram className="absolute -top-1 -right-1 h-3 w-3 text-pink-400 bg-white/0" />
                  </span>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>

            {confirmedBookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-6 text-sm">No confirmed attendees yet</p>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                {confirmedBookings.map((booking, index) => (
                  <Link
                    key={booking.id}
                    href={`/profile/${booking.profiles.id}`}
                    className="flex items-center p-2 bg-muted/40 rounded-lg border border-border hover:border-muted-foreground/40 hover:bg-muted/60 transition-all cursor-pointer"
                  >
                    <Avatar className="w-8 h-8 mr-2 bg-foreground ring-2 ring-muted-foreground/40 shrink-0">
                      <AvatarFallback className="text-background text-xs font-bold bg-foreground">
                        {index + 1}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate hover:text-primary transition-colors">
                        {booking.profiles.full_name}
                      </p>
                      {getBookingArtTypeLabel(booking) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getBookingArtTypeLabel(booking)}
                        </p>
                      )}
                    </div>
                    <Avatar className="w-8 h-8 shrink-0 rounded-full overflow-hidden">
                      <AvatarImage src={booking.profiles.avatar_url || undefined} alt="" />
                      <AvatarFallback className="text-xs font-medium bg-muted">
                        {(booking.profiles.full_name || '')
                          .split(/\s+/)
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2) || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waitlist */}
        {waitlistBookings.length > 0 && (
          <Card className="rounded-none sm:rounded-lg border-x-0 sm:border-x">
            <CardHeader>
              <CardTitle className="text-lg md:text-xl">
                Waitlist ({waitlistBookings.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                {waitlistBookings.map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/profile/${booking.profiles.id}`}
                    className="flex items-center p-2 bg-muted/40 rounded-lg border border-border hover:border-muted-foreground/40 hover:bg-muted/60 transition-all cursor-pointer"
                  >
                    <Avatar className="w-8 h-8 mr-2 bg-foreground ring-2 ring-muted-foreground/40 shrink-0">
                      <AvatarFallback className="text-background text-xs font-bold bg-foreground">
                        {booking.waitlist_position}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate hover:text-primary transition-colors">
                        {booking.profiles.full_name}
                      </p>
                      {getBookingArtTypeLabel(booking) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getBookingArtTypeLabel(booking)}
                        </p>
                      )}
                    </div>
                    <Avatar className="w-8 h-8 shrink-0 rounded-full overflow-hidden">
                      <AvatarImage src={booking.profiles.avatar_url || undefined} alt="" />
                      <AvatarFallback className="text-xs font-medium bg-muted">
                        {(booking.profiles.full_name || '')
                          .split(/\s+/)
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2) || '?'}
                      </AvatarFallback>
                    </Avatar>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>

      {/* Event Chat Overlay */}
      {showChat && currentUser && (
        <EventChat
          eventId={(event as any).id || eventId}
          eventTitle={event.title}
          isHost={isHost || isEventCreator}
          chatMode={(event as any).chat_mode || 'open'}
          currentUserId={currentUser.id}
          canSendMessages={canSendChatMessages}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Booking strip - fixed above nav when user has a booking */}
      {userBooking && (
        <Link
          href={`/bookings/${userBooking.id}`}
          className="fixed left-0 right-0 z-40 flex items-center justify-center py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-sm shadow-lg"
          style={{ bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          Go to booking
        </Link>
      )}

      {/* Bottom Navigation */}
<Dialog open={venueOpen} onOpenChange={setVenueOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Venue Details</DialogTitle>
            <DialogDescription>Additional information about this venue.</DialogDescription>
          </DialogHeader>
          {venue && (
            <div className="space-y-3 text-sm text-muted-foreground">
              <div>
                <p className="text-base font-semibold text-foreground">{venue.name}</p>
                <p>{venue.address}</p>
              </div>
              {venue.parking_options && (
                <div>
                  <p className="font-medium text-foreground">Parking</p>
                  <p>{venue.parking_options}</p>
                </div>
              )}
              {venue.accessibility && (
                <div>
                  <p className="font-medium text-foreground">Accessibility</p>
                  <p>{venue.accessibility}</p>
                </div>
              )}
              <div>
                <p className="font-medium text-foreground">Food & Drinks</p>
                <p>{venue.food_drinks_available ? 'Available' : 'Not available'}</p>
              </div>
              <div>
                <p className="font-medium text-foreground">Drinks</p>
                <p>{venue.drinks_available ? 'Available' : 'Not available'}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
