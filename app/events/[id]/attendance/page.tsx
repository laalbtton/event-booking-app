'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import { createNotification } from '@/lib/notifications'
import Link from 'next/link'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ChevronLeft, Clock, GripVertical, User, Copy, ChevronDown, MessageCircle, Users, Mail, Send, Eye, Star, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { userCanManageEventChatSettings } from '@/lib/eventChatPermissions'
import { EventCommunitiesDialog } from '@/components/EventCommunitiesDialog'
import { toast } from 'sonner'

type BookingWithProfile = {
  id: string
  user_id: string
  credits_used?: number
  status: string
  booking_scope?: 'performer' | 'audience'
  event_art_type_id?: string | null
  attendance_status: string | null
  no_show_penalty_charged_at?: string | null
  audience_checkin_code?: string | null
  booked_at: string
  waitlist_position?: number | null
  profiles: {
    id: string
    full_name: string
    email: string
  }
  event_art_types?: {
    id: string
    art_type_name: string
  } | null
}

type InviteWithProfile = {
  id: string
  invited_user_id: string
  status: 'pending' | 'accepted' | 'declined'
  profiles: {
    id: string
    full_name: string
    email: string
  }
}

type InviteLink = {
  id: string
  token: string
  max_uses: number
  uses: number
  expires_at: string
}

type RecentRedemption = {
  id: string
  code: string
  valueCents: number
  redeemedAt: string
  attendeeLabel: string
}

type HostSearchResult = {
  id: string
  full_name: string | null
  email: string | null
}

type EventDetails = {
  id: string
  title: string
  date: string
  end_time?: string | null
  host_user_id: string | null
  created_by: string | null
  event_type: 'open_mic' | 'booked_show'
  credits_required: number
  max_attendees: number | null
  no_show_penalty_enabled?: boolean | null
  no_show_penalty_credits?: number | null
  food_coupon_enabled?: boolean
  audience_attendance_open_before_minutes?: number
  audience_attendance_cutoff_hours?: number
  chat_enabled?: boolean
  chat_mode?: 'open' | 'host_only'
}

type VoucherPreview = {
  id: string
  code: string
  eventId: string
  eventTitle: string
  attendeeName: string
  attendeeEmail: string | null
  valueCents: number
  status: string
  expiresAt: string | null
  canRedeem: boolean
}

type ScannerEngine = 'native' | 'html5' | null

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function AttendancePage() {
  const { confirm } = useConfirmDialog()
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [resolvedId, setResolvedId] = useState(eventId)
  const [event, setEvent] = useState<EventDetails | null>(null)
  const [bookings, setBookings] = useState<BookingWithProfile[]>([])
  const [audienceBookings, setAudienceBookings] = useState<BookingWithProfile[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<BookingWithProfile[]>([])
  const [attendeeTab, setAttendeeTab] = useState<'performers' | 'audience'>('performers')
  const [audienceFilter, setAudienceFilter] = useState<'all' | 'checked_in' | 'not_arrived'>('all')
  const [audienceSearch, setAudienceSearch] = useState('')
  const [audienceCheckinCodeInput, setAudienceCheckinCodeInput] = useState('')
  const [invites, setInvites] = useState<InviteWithProfile[]>([])
  const [inviteSearch, setInviteSearch] = useState('')
  const [inviteResults, setInviteResults] = useState<InviteWithProfile[]>([])
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null)
  const [inviteMaxUses, setInviteMaxUses] = useState('12')
  const [inviteExpiresAt, setInviteExpiresAt] = useState(() => {
    const date = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  })
  const [showInviteAdvanced, setShowInviteAdvanced] = useState(false)
  const [showRedeemTools, setShowRedeemTools] = useState(false)
  const [showReplaceHostPanel, setShowReplaceHostPanel] = useState(false)
  const [hostSearch, setHostSearch] = useState('')
  const [hostSearchResults, setHostSearchResults] = useState<HostSearchResult[]>([])
  const [hostSearchLoading, setHostSearchLoading] = useState(false)
  const [redeemCode, setRedeemCode] = useState('')
  const [redeemOrderTotal, setRedeemOrderTotal] = useState('')
  const [redeemNotes, setRedeemNotes] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState('')
  const [redeemError, setRedeemError] = useState('')
  const [redeemPreview, setRedeemPreview] = useState<VoucherPreview | null>(null)
  const [recentRedemptions, setRecentRedemptions] = useState<RecentRedemption[]>([])
  const [showRefundTools, setShowRefundTools] = useState(false)
  const [showNoShowPenaltyTools, setShowNoShowPenaltyTools] = useState(false)
  const [noShowPenaltyEnabled, setNoShowPenaltyEnabled] = useState(true)
  const [noShowPenaltyCredits, setNoShowPenaltyCredits] = useState('5')
  const [noShowPenaltyFeatureAvailable, setNoShowPenaltyFeatureAvailable] = useState(true)
  const [savingNoShowPenalty, setSavingNoShowPenalty] = useState(false)
  const [processingNoShowPenalties, setProcessingNoShowPenalties] = useState(false)
  const [refundMode, setRefundMode] = useState<'full' | 'specific'>('full')
  const [refundAmount, setRefundAmount] = useState('1')
  const [selectedRefundBookingIds, setSelectedRefundBookingIds] = useState<Set<string>>(new Set())
  const [refundLoading, setRefundLoading] = useState(false)
  const [refundMessage, setRefundMessage] = useState('')
  const [refundError, setRefundError] = useState('')
  const [scannerActive, setScannerActive] = useState(false)
  const [scannerSupported, setScannerSupported] = useState(true)
  const [scannerMessage, setScannerMessage] = useState('')
  const [scannerEngine, setScannerEngine] = useState<ScannerEngine>(null)
  const [scannerMode, setScannerMode] = useState<'coupon' | 'audience'>('coupon')
  const [chatEnabled, setChatEnabled] = useState(false)
  const [chatMode, setChatMode] = useState<'open' | 'host_only'>('open')
  const [savingChat, setSavingChat] = useState(false)
  const [communitiesDialogOpen, setCommunitiesDialogOpen] = useState(false)
  const [emailDialogOpen, setEmailDialogOpen] = useState(false)
  const [emailSubject, setEmailSubject] = useState('')
  const [emailCustomNote, setEmailCustomNote] = useState('')
  const [emailPreviewMode, setEmailPreviewMode] = useState<'edit' | 'preview'>('edit')
  const [sendingEmails, setSendingEmails] = useState(false)
  const [emailSendResult, setEmailSendResult] = useState<{ emailsSent: number; skipped: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hostProfile, setHostProfile] = useState<{ id: string; full_name: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [canManageHost, setCanManageHost] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    attended: 0,
    noShow: 0,
    pending: 0
  })
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDraggingOverHost, setIsDraggingOverHost] = useState(false)
  const [isDraggingOverWaitlist, setIsDraggingOverWaitlist] = useState(false)
  const [isDraggingOverConfirmed, setIsDraggingOverConfirmed] = useState(false)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeDirection, setSwipeDirection] = useState<Record<string, 'left' | 'right'>>({})
  const touchStartX = useRef<Record<string, number>>({})
  const touchStartY = useRef<Record<string, number>>({})
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null)
  const scannerStreamRef = useRef<MediaStream | null>(null)
  const scannerIntervalRef = useRef<number | null>(null)
  const html5ScannerRef = useRef<any>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    return () => {
      stopScanner()
    }
  }, [])

  const html5ScannerElementId = `coupon-qr-reader-${eventId}`

  function applyScannedCode(value: string) {
    if (scannerMode === 'audience') {
      setAudienceCheckinCodeInput(value)
      return
    }
    setRedeemCode(value)
    void lookupVoucher(value)
  }

  async function lookupVoucher(inputCode?: string): Promise<VoucherPreview | null> {
    const code = (inputCode || redeemCode).trim().toUpperCase()
    if (!code) {
      setRedeemPreview(null)
      return null
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const params = new URLSearchParams({ code, eventId: resolvedId })
      const response = await fetch(`/api/vouchers/lookup?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to lookup coupon')

      const preview = data.voucher as VoucherPreview
      setRedeemPreview(preview)
      setRedeemCode(preview.code)
      setRedeemOrderTotal((Math.max(0, Number(preview.valueCents || 0)) / 100).toFixed(2))
      return preview
    } catch (error: any) {
      setRedeemPreview(null)
      setRedeemError(error.message || 'Failed to lookup coupon')
      return null
    }
  }

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Check user role
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      router.push('/dashboard')
      return
    }

    setUserRole(profile.role)
    await loadData(user.id)
  }

  function stopScanner() {
    if (scannerIntervalRef.current) {
      window.clearInterval(scannerIntervalRef.current)
      scannerIntervalRef.current = null
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null
    }
    if (html5ScannerRef.current) {
      const scanner = html5ScannerRef.current
      html5ScannerRef.current = null
      void scanner.stop().catch(() => undefined).finally(() => {
        void scanner.clear().catch(() => undefined)
      })
    }
    setScannerEngine(null)
    setScannerActive(false)
  }

  async function startHtml5Scanner() {
    setScannerSupported(true)
    setScannerEngine('html5')
    setScannerActive(true)
    setScannerMessage('Starting camera scanner...')

    // Ensure the scanner container is mounted before constructing Html5Qrcode.
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(html5ScannerElementId)
    html5ScannerRef.current = scanner
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      (decodedText: string) => {
        if (!decodedText) return
        applyScannedCode(decodedText.trim())
        setScannerMessage(scannerMode === 'audience' ? 'Code detected. Ready to mark attendance.' : 'QR code detected. Ready to redeem.')
        stopScanner()
      },
      () => undefined
    )
    setScannerMessage(
      scannerMode === 'audience'
        ? 'Scanner is active. Point camera at attendee check-in code.'
        : 'Scanner is active. Point camera at coupon QR code.'
    )
  }

  async function startScanner() {
    setScannerMessage('')
    setRedeemError('')

    const DetectorCtor = (window as any).BarcodeDetector
    if (DetectorCtor) {
      try {
        setScannerSupported(true)
        setScannerEngine('native')
        setScannerActive(true)
        setScannerMessage('Starting camera scanner...')

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        scannerStreamRef.current = stream
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream
          await scannerVideoRef.current.play().catch(() => undefined)
        }

        const detector = new DetectorCtor({ formats: ['qr_code'] })
        scannerIntervalRef.current = window.setInterval(async () => {
          try {
            if (!scannerVideoRef.current) return
            const barcodes = await detector.detect(scannerVideoRef.current)
            if (!barcodes?.length) return
            const rawValue = barcodes[0]?.rawValue
            if (!rawValue) return
            applyScannedCode(rawValue.trim())
            setScannerMessage(scannerMode === 'audience' ? 'Code detected. Ready to mark attendance.' : 'QR code detected. Ready to redeem.')
            stopScanner()
          } catch {
            // Keep polling frames.
          }
        }, 500)

        setScannerMessage(
          scannerMode === 'audience'
            ? 'Scanner is active. Point camera at attendee check-in code.'
            : 'Scanner is active. Point camera at coupon QR code.'
        )
        return
      } catch {
        stopScanner()
      }
    }

    try {
      await startHtml5Scanner()
    } catch (error: any) {
      stopScanner()
      setScannerSupported(false)
      setScannerMessage(error?.message || 'Could not start camera scanner. Use manual code entry.')
    }
  }

  async function loadData(userId: string) {
    setLoading(true)
    try {
      // Get current user role if not set
      let currentUserRole = userRole
      if (!currentUserRole) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single()
        currentUserRole = profileData?.role || null
      }

      // Resolve the real UUID in case eventId is a slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)
      let resolvedEventId = eventId
      if (!isUuid) {
        const { data: slugRow } = await supabase
          .from('events')
          .select('id')
          .eq('slug', eventId)
          .maybeSingle()
        if (slugRow?.id) {
          resolvedEventId = slugRow.id
        }
      }
      setResolvedId(resolvedEventId)

      // Load event (fallback for environments missing no-show penalty columns).
      let eventData: EventDetails | null = null
      let eventError: Error | null = null
      let penaltyColumnsAvailable = true

      const eventWithPenaltyQuery = await supabase
        .from('events')
        .select('id, title, date, end_time, host_user_id, created_by, event_type, credits_required, max_attendees, no_show_penalty_enabled, no_show_penalty_credits, food_coupon_enabled, audience_attendance_open_before_minutes, audience_attendance_cutoff_hours, chat_enabled, chat_mode')
        .eq('id', resolvedEventId)
        .single()

      if (eventWithPenaltyQuery.error && isMissingNoShowPenaltyColumnsError(eventWithPenaltyQuery.error.message)) {
        penaltyColumnsAvailable = false
        const fallbackQuery = await supabase
          .from('events')
          .select('id, title, date, end_time, host_user_id, created_by, event_type, credits_required, max_attendees, food_coupon_enabled, audience_attendance_open_before_minutes, audience_attendance_cutoff_hours')
          .eq('id', resolvedEventId)
          .single()
        eventError = fallbackQuery.error ? new Error(fallbackQuery.error.message) : null
        if (fallbackQuery.data) {
          eventData = {
            ...fallbackQuery.data,
            no_show_penalty_enabled: null,
            no_show_penalty_credits: null,
          } as EventDetails
        }
      } else {
        eventError = eventWithPenaltyQuery.error ? new Error(eventWithPenaltyQuery.error.message) : null
        eventData = (eventWithPenaltyQuery.data || null) as EventDetails | null
      }

      if (eventError || !eventData) throw eventError || new Error('Event not found')
      setNoShowPenaltyFeatureAvailable(penaltyColumnsAvailable)

      // Check access: event creators can only access their own events
      // Admins can access all events
      // Hosts can access events where they are assigned as host
      // Community admin/co_admin for a linked community can access (e.g. chat settings)
      const isEventCreator = currentUserRole === 'event_creator' && eventData.created_by === userId
      const isAdmin = currentUserRole === 'admin'
      const isHost = eventData.host_user_id === userId

      const canAccessViaCommunity = await userCanManageEventChatSettings(supabase, resolvedEventId, userId, {
        host_user_id: eventData.host_user_id,
        created_by: eventData.created_by,
      })

      if (!isEventCreator && !isAdmin && !isHost && !canAccessViaCommunity) {
        router.push('/dashboard')
        return
      }

      // Only event creators and admins can manage host assignments
      setCanManageHost(isEventCreator || isAdmin)

      setEvent(eventData)
      setChatEnabled(eventData.chat_enabled ?? false)
      setChatMode((eventData.chat_mode as 'open' | 'host_only') ?? 'open')
      const penaltySettings = getEffectiveNoShowSettings(eventData)
      setNoShowPenaltyEnabled(penaltySettings.enabled)
      setNoShowPenaltyCredits(String(penaltySettings.penalty))

      // Load host profile if host is assigned
      if (eventData.host_user_id) {
        const { data: hostData, error: hostError } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', eventData.host_user_id)
          .single()

        if (!hostError && hostData) {
          setHostProfile(hostData)
        }
      } else {
        setHostProfile(null)
      }

      // Load all confirmed bookings for this event
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          credits_used,
          status,
          booking_scope,
          event_art_type_id,
          attendance_status,
          no_show_penalty_charged_at,
          audience_checkin_code,
          booked_at,
          waitlist_position,
          event_art_types:event_art_type_id (
            id,
            art_type_name
          ),
          profiles (
            id,
            full_name,
            email
          )
        `)
        .eq('event_id', resolvedEventId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      if (bookingsError) throw bookingsError
      const performerBookings = (bookingsData || []).filter((b: any) => b.booking_scope !== 'audience')
      const audienceRows = (bookingsData || []).filter((b: any) => b.booking_scope === 'audience')
      setBookings(performerBookings as any)
      setAudienceBookings(audienceRows as any)

      const { data: waitlistData, error: waitlistError } = await supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          credits_used,
          status,
          booking_scope,
          event_art_type_id,
          attendance_status,
          no_show_penalty_charged_at,
          audience_checkin_code,
          booked_at,
          waitlist_position,
          event_art_types:event_art_type_id (
            id,
            art_type_name
          ),
          profiles (
            id,
            full_name,
            email
          )
        `)
        .eq('event_id', resolvedEventId)
        .eq('status', 'waitlist')
        .order('waitlist_position', { ascending: true })
        .order('booked_at', { ascending: true })

      if (waitlistError) throw waitlistError
      const performerWaitlist = (waitlistData || []).filter((b: any) => b.booking_scope !== 'audience')
      setWaitlistBookings(performerWaitlist as any)

      if (eventData.food_coupon_enabled) {
        const { data: redeemedVouchers, error: redeemedError } = await supabase
          .from('booking_vouchers')
          .select('id, code, value_cents, redeemed_at, user_id')
          .eq('event_id', resolvedEventId)
          .eq('status', 'redeemed')
          .order('redeemed_at', { ascending: false })
          .limit(8)

        if (!redeemedError && redeemedVouchers) {
          const attendeeMap = new Map<string, string>()
          ;(bookingsData || []).forEach((booking: any) => {
            if (booking.user_id && booking.profiles?.full_name) {
              attendeeMap.set(booking.user_id, booking.profiles.full_name)
            }
          })
          ;(waitlistData || []).forEach((booking: any) => {
            if (booking.user_id && booking.profiles?.full_name && !attendeeMap.has(booking.user_id)) {
              attendeeMap.set(booking.user_id, booking.profiles.full_name)
            }
          })

          setRecentRedemptions(
            redeemedVouchers
              .filter((voucher: any) => voucher.redeemed_at)
              .map((voucher: any) => ({
                id: voucher.id,
                code: voucher.code,
                valueCents: Number(voucher.value_cents || 0),
                redeemedAt: voucher.redeemed_at,
                attendeeLabel: attendeeMap.get(voucher.user_id) || `User ${String(voucher.user_id).slice(0, 8)}`,
              }))
          )
        } else {
          setRecentRedemptions([])
        }
      } else {
        setRecentRedemptions([])
      }

      const { data: invitesData, error: invitesError } = await supabase
        .from('event_invites')
        .select(`
          id,
          invited_user_id,
          status,
          profiles:invited_user_id (
            id,
            full_name,
            email
          )
        `)
        .eq('event_id', resolvedEventId)
        .order('created_at', { ascending: false })

      if (!invitesError) {
        setInvites(invitesData as any)
      }

      const { data: inviteLinkData, error: inviteLinkError } = await supabase
        .from('event_invite_links')
        .select('id, token, max_uses, uses, expires_at')
        .eq('event_id', resolvedEventId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!inviteLinkError && inviteLinkData) {
        setInviteLink(inviteLinkData as any)
        setInviteMaxUses(inviteLinkData.max_uses.toString())
        const expiresLocal = new Date(new Date(inviteLinkData.expires_at).getTime() - new Date(inviteLinkData.expires_at).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
        setInviteExpiresAt(expiresLocal)
      }

      // Calculate stats
      const total = performerBookings?.length || 0
      const attended = performerBookings?.filter((b: any) => b.attendance_status === 'attended').length || 0
      const noShow = total - attended // All non-attended are no shows by default
      const confirmed = performerBookings?.filter((b: any) => !b.attendance_status || b.attendance_status === 'confirmed').length || 0
      const pending = performerBookings?.filter((b: any) => !b.attendance_status).length || 0

      setStats({
        total,
        confirmed,
        attended,
        noShow,
        pending
      })

    } catch (error: any) {
      console.error('Error loading data:', error)
      alert('Error loading data: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  function recalcStats(updatedBookings: BookingWithProfile[]) {
    const total = updatedBookings.length
    const attended = updatedBookings.filter((b) => b.attendance_status === 'attended').length
    const noShow = total - attended
    const confirmed = updatedBookings.filter((b) => !b.attendance_status || b.attendance_status === 'confirmed').length
    const pending = updatedBookings.filter((b) => !b.attendance_status).length

    setStats({
      total,
      confirmed,
      attended,
      noShow,
      pending
    })
  }

  function getArtTypeLabel(booking: BookingWithProfile): string {
    return booking.event_art_types?.art_type_name || 'General'
  }

  function groupBookingsByArtType(list: BookingWithProfile[]) {
    const grouped = new Map<string, BookingWithProfile[]>()
    for (const booking of list) {
      const key = getArtTypeLabel(booking)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(booking)
    }
    return Array.from(grouped.entries())
  }

  function getEffectiveNoShowSettings(eventRow: EventDetails) {
    const defaultEnabled = Number(eventRow.credits_required || 0) <= 0
    const enabled = eventRow.no_show_penalty_enabled ?? defaultEnabled
    const penalty = Math.max(0, Number(eventRow.no_show_penalty_credits ?? 5))
    return { enabled, penalty }
  }

  function isMissingNoShowPenaltyColumnsError(message: string | undefined) {
    const text = String(message || '').toLowerCase()
    return text.includes('no_show_penalty_enabled') || text.includes('no_show_penalty_credits')
  }

  function getEventEndTime(eventRow: EventDetails) {
    return new Date(eventRow.end_time || eventRow.date)
  }

  function getNoShowPenaltyCandidates() {
    return bookings.filter(
      (booking) =>
        Number(booking.credits_used || 0) <= 0 &&
        booking.attendance_status !== 'attended' &&
        !booking.no_show_penalty_charged_at
    )
  }

  function isAudienceAttendanceWindowOpen() {
    if (!event?.date) return false
    const eventStart = new Date(event.date)
    const now = new Date()
    const openBeforeMinutes = Math.max(0, Number(event.audience_attendance_open_before_minutes || 30))
    const cutoffHours = Math.max(0, Number(event.audience_attendance_cutoff_hours || 2))
    const windowOpenAt = new Date(eventStart.getTime() - openBeforeMinutes * 60 * 1000)
    const windowClosesAt = new Date(eventStart.getTime() + cutoffHours * 60 * 60 * 1000)
    return now >= windowOpenAt && now <= windowClosesAt
  }

  async function markAudienceByCode() {
    const code = audienceCheckinCodeInput.trim().toUpperCase()
    if (!code) return
    const target = audienceBookings.find((booking) => (booking.audience_checkin_code || '').toUpperCase() === code)
    if (!target) {
      alert('No audience booking found for that check-in code.')
      return
    }
    await updateAttendance(target.id, 'attended')
    setAudienceCheckinCodeInput('')
  }

  async function updateAttendance(bookingId: string, status: 'attended' | null) {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/update-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId, status }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update attendance')
      }

      setBookings((prev) => {
        const updated = prev.map((booking) =>
          booking.id === bookingId
            ? { ...booking, attendance_status: status }
            : booking
        )
        recalcStats(updated)
        return updated
      })
      setAudienceBookings((prev) =>
        prev.map((booking) =>
          booking.id === bookingId
            ? { ...booking, attendance_status: status }
            : booking
        )
      )
    } catch (error: any) {
      console.error('Error updating attendance:', error)
      alert('Error updating attendance: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function updateBookingStatus(bookingId: string, nextStatus: 'confirmed' | 'waitlist') {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/update-booking-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId, status: nextStatus }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update booking')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      console.error('Error updating booking:', error)
      alert('Error updating booking: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function searchInvitees(query: string) {
    setInviteSearch(query)
    if (!query || query.trim().length < 2) {
      setInviteResults([])
      return
    }

    setInviteLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .ilike('full_name', `%${query}%`)
      .limit(8)

    if (!error && data) {
      const mapped = data.map((profile) => ({
        id: profile.id,
        invited_user_id: profile.id,
        status: 'pending' as const,
        profiles: profile,
      }))
      setInviteResults(mapped as any)
    }
    setInviteLoading(false)
  }

  async function sendInvite(invitedUserId: string) {
    setUpdating(invitedUserId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/invites/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId: resolvedId, invitedUserId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send invite')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
      setInviteSearch('')
      setInviteResults([])
    } catch (error: any) {
      console.error('Error sending invite:', error)
      alert('Error sending invite: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function createInviteLink() {
    setInviteLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/invite-links/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: resolvedId,
          maxUses: parseInt(inviteMaxUses, 10) || 12,
          expiresAt: inviteExpiresAt ? new Date(inviteExpiresAt).toISOString() : undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to create invite link')
      }

      const data = await response.json()
      setInviteLink(data.link)
    } catch (error: any) {
      console.error('Error creating invite link:', error)
      alert('Error creating invite link: ' + error.message)
    } finally {
      setInviteLoading(false)
    }
  }

  function copyInviteLink() {
    if (!inviteLink) return
    const url = `${window.location.origin}/invite/${inviteLink.token}`
    navigator.clipboard.writeText(url)
    alert('Invite link copied!')
  }

  async function removeAttendee(bookingId: string) {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/remove-attendee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove attendee')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      console.error('Error removing attendee:', error)
      alert('Error removing attendee: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function redeemCoupon() {
    if (!redeemCode.trim()) {
      setRedeemError('Enter a coupon code to redeem.')
      return
    }

    setRedeemLoading(true)
    setRedeemError('')
    setRedeemMessage('')

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const parsedOrderTotal = redeemOrderTotal.trim()
        ? Math.round(Number(redeemOrderTotal) * 100)
        : undefined

      if (parsedOrderTotal !== undefined && (Number.isNaN(parsedOrderTotal) || parsedOrderTotal < 0)) {
        throw new Error('Order total must be a valid non-negative amount.')
      }

      const preview = redeemPreview || (await lookupVoucher(redeemCode))
      if (!preview) {
        throw new Error('Please lookup a valid coupon first')
      }
      if (!preview.canRedeem) {
        throw new Error('This coupon is not redeemable in its current state')
      }

      const amountText = `$${(Math.max(0, Number(preview.valueCents || 0)) / 100).toFixed(2)}`
      const shouldRedeem = await confirm({
        title: 'Confirm coupon redemption',
        message: `Redeem ${amountText} coupon for ${preview.attendeeName}?\n\nCoupon: ${preview.code}\n\n⚠️ Only redeem if this person is physically present and using their coupon right now.\n\nConfirming will return ${amountText} in credits to the attendee's account.`,
        confirmText: `Yes, redeem ${amountText}`,
        cancelText: 'Cancel',
      })
      if (!shouldRedeem) {
        setRedeemLoading(false)
        return
      }

      const response = await fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: redeemCode.trim().toUpperCase(),
          orderTotalCents: parsedOrderTotal,
          notes: redeemNotes.trim() || undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Failed to redeem coupon')
      }

      const discount = Number(data.discountCents || 0) / 100
      setRedeemMessage(`Coupon redeemed successfully. Discount applied: $${discount.toFixed(2)}.`)
      setRedeemCode('')
      setRedeemOrderTotal('')
      setRedeemNotes('')
      setRedeemPreview(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      setRedeemError(error.message || 'Failed to redeem coupon')
    } finally {
      setRedeemLoading(false)
    }
  }

  async function submitBatchRefunds() {
    const bookingIds = Array.from(selectedRefundBookingIds)
    if (!event || bookingIds.length === 0) {
      setRefundError('Select at least one attendee to refund.')
      return
    }

    const parsedAmount = Number(refundAmount)
    if (refundMode === 'specific' && (!Number.isFinite(parsedAmount) || parsedAmount <= 0)) {
      setRefundError('Enter a valid specific refund amount.')
      return
    }

    const shouldProceed = await confirm({
      title: 'Issue batch refund?',
      message:
        refundMode === 'full'
          ? `Refund full eligible balances for ${bookingIds.length} attendee(s)?`
          : `Refund up to ${Math.floor(parsedAmount)} credits for ${bookingIds.length} attendee(s), capped by refundable balance?`,
      confirmText: 'Issue refunds',
      cancelText: 'Cancel',
      variant: 'destructive',
    })

    if (!shouldProceed) return

    setRefundLoading(true)
    setRefundError('')
    setRefundMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/refunds/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: resolvedId,
          bookingIds,
          mode: refundMode,
          specificAmount: refundMode === 'specific' ? Math.floor(parsedAmount) : undefined,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to issue refunds')

      setRefundMessage(
        `Refunded ${data.refundedCount || 0} attendee(s), total ${data.refundedTotal || 0} credits. ${
          (data.skippedCount || 0) > 0 ? `${data.skippedCount} skipped.` : ''
        }`
      )
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
      setSelectedRefundBookingIds(new Set())
    } catch (error: any) {
      setRefundError(error.message || 'Failed to issue refunds')
    } finally {
      setRefundLoading(false)
    }
  }

  function copyAttendanceList() {
    const attended = bookings.filter((booking) => booking.attendance_status === 'attended')
    const noShow = bookings.filter((booking) => booking.attendance_status !== 'attended')

    const buildSection = (label: string, rows: BookingWithProfile[]) => {
      const grouped = groupBookingsByArtType(rows)
      if (grouped.length === 0) return `${label} (0)\nNone`
      const parts = grouped.map(([artType, artRows]) => {
        const lines = artRows.map((booking, index) => `${index + 1}. ${booking.profiles.full_name || 'No name'}`)
        return `${artType} (${artRows.length})\n${lines.join('\n')}`
      })
      return `${label} (${rows.length})\n${parts.join('\n\n')}`
    }

    let text = buildSection('Attending', attended)
    text += `\n\n${buildSection('No Show', noShow)}`

    navigator.clipboard.writeText(text)
    alert('Attendance list copied!')
  }

  async function setHost(userId: string | null) {
    setUpdating('host')
    try {
      const previousHostId = event?.host_user_id ?? null
      const { error } = await supabase
        .from('events')
        .update({ host_user_id: userId })
        .eq('id', resolvedId)

      if (error) throw error

      if (userId && userId !== previousHostId) {
        await createNotification(
          userId,
          'general',
          'Assigned as event host',
          `You have been designated as host for "${event?.title || 'an event'}".`,
          null,
          resolvedId
        )
      }

      if (previousHostId && previousHostId !== userId) {
        await createNotification(
          previousHostId,
          'general',
          'Host role updated',
          `You are no longer the host for "${event?.title || 'an event'}".`,
          null,
          resolvedId
        )
      }

      await loadData((await supabase.auth.getUser()).data.user!.id)
    } catch (error: any) {
      console.error('Error setting host:', error)
      alert('Error setting host: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function searchHostCandidates(query: string) {
    setHostSearch(query)
    const trimmed = query.trim()
    if (!trimmed || trimmed.length < 2) {
      setHostSearchResults([])
      setHostSearchLoading(false)
      return
    }

    setHostSearchLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
      .limit(10)

    if (!error && data) {
      setHostSearchResults(data as HostSearchResult[])
    } else {
      setHostSearchResults([])
    }
    setHostSearchLoading(false)
  }

  async function saveNoShowPenaltySettings() {
    if (!event) return
    if (!noShowPenaltyFeatureAvailable) {
      alert('No-show penalty settings are unavailable on this deployment until the migration is applied.')
      return
    }
    const parsedPenalty = Math.max(0, Math.floor(Number(noShowPenaltyCredits || '0')))
    if (!Number.isFinite(parsedPenalty)) {
      alert('Penalty amount must be a valid number.')
      return
    }

    setSavingNoShowPenalty(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/events/no-show-penalty-settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: resolvedId,
          enabled: noShowPenaltyEnabled,
          penaltyCredits: parsedPenalty,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to update no-show penalty settings')

      setNoShowPenaltyCredits(String(parsedPenalty))
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              no_show_penalty_enabled: noShowPenaltyEnabled,
              no_show_penalty_credits: parsedPenalty,
            }
          : prev
      )
      alert('No-show penalty settings updated.')
    } catch (error: any) {
      alert(`Error updating no-show penalty settings: ${error.message || 'Unknown error'}`)
    } finally {
      setSavingNoShowPenalty(false)
    }
  }

  async function processNoShowPenaltiesForEvent() {
    if (!event) return
    if (!noShowPenaltyFeatureAvailable) {
      alert('No-show penalty processing is unavailable on this deployment until the migration is applied.')
      return
    }
    const eventEnd = getEventEndTime(event)
    if (Number.isNaN(eventEnd.getTime()) || eventEnd > new Date()) {
      alert('No-show penalties can only be processed after event end time.')
      return
    }

    const penalty = Math.max(0, Math.floor(Number(noShowPenaltyCredits || '0')))
    const candidates = getNoShowPenaltyCandidates()
    const totalImpact = candidates.length * penalty

    const shouldProceed = await confirm({
      title: 'Process no-show penalties?',
      message:
        `You are about to process no-show penalties for "${event.title}".\n\n` +
        `Eligible free performer bookings not marked attended: ${candidates.length}\n` +
        `Penalty per booking: ${penalty} credits\n` +
        `Estimated total charge: ${totalImpact} credits\n\n` +
        'This action will deduct credits, can create negative balances, mark bookings as no-show, and notify affected users.',
      confirmText: 'Process penalties',
      cancelText: 'Cancel',
      variant: 'destructive',
    })
    if (!shouldProceed) return

    setProcessingNoShowPenalties(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/events/process-no-show-penalties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId: resolvedId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to process no-show penalties')

      alert(`Processed penalties. Charged: ${Number(data.charged || 0)}. Skipped: ${Number(data.skipped || 0)}.`)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      alert(`Error processing no-show penalties: ${error.message || 'Unknown error'}`)
    } finally {
      setProcessingNoShowPenalties(false)
    }
  }

  async function reorderBookings(newOrder: BookingWithProfile[]) {
    // Note: This is a UI-only reorder. If you need to persist order in the database,
    // you would need to add an order field to the bookings table.
    setBookings(newOrder)
  }

  function handleDragStart(e: React.DragEvent, bookingId: string) {
    setDraggedItem(bookingId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, index?: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== undefined) {
      setDragOverIndex(index)
    }
  }

  function handleDragLeave() {
    setDragOverIndex(null)
    setIsDraggingOverHost(false)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleDrop(e: React.DragEvent, targetIndex?: number) {
    e.preventDefault()
    
    if (!draggedItem) return

    // Handle drop on host zone
    if (isDraggingOverHost && canManageHost) {
      const booking = bookings.find(b => b.id === draggedItem)
      if (booking) {
        setHost(booking.user_id)
      }
      setIsDraggingOverHost(false)
      setDraggedItem(null)
      return
    }

    // Handle reordering
    if (targetIndex !== undefined && draggedItem) {
      const draggedIndex = bookings.findIndex(b => b.id === draggedItem)
      if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
        const newBookings = [...bookings]
        const [removed] = newBookings.splice(draggedIndex, 1)
        newBookings.splice(targetIndex, 0, removed)
        reorderBookings(newBookings)
      }
    }

    setDragOverIndex(null)
    setDraggedItem(null)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleHostDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverHost(true)
  }

  function handleWaitlistDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverWaitlist(true)
  }

  function handleConfirmedDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverConfirmed(true)
  }

  function handleDropToStatus(status: 'confirmed' | 'waitlist') {
    if (!draggedItem) return
    const isAlreadyConfirmed = bookings.some((booking) => booking.id === draggedItem)
    const isAlreadyWaitlist = waitlistBookings.some((booking) => booking.id === draggedItem)
    if (status === 'confirmed' && isAlreadyConfirmed) return
    if (status === 'waitlist' && isAlreadyWaitlist) return
    updateBookingStatus(draggedItem, status)
    setDraggedItem(null)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleTouchStart(e: React.TouchEvent, bookingId: string) {
    touchStartX.current[bookingId] = e.touches[0].clientX
    touchStartY.current[bookingId] = e.touches[0].clientY
    setSwipingId(bookingId)
  }

  function handleTouchMove(e: React.TouchEvent, bookingId: string) {
    if (swipingId !== bookingId) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const startX = touchStartX.current[bookingId]
    const startY = touchStartY.current[bookingId]

    const deltaX = currentX - startX
    const deltaY = Math.abs(currentY - startY)

    if (deltaY < 50 && deltaX < 0) {
      const offset = Math.max(deltaX, -100)
      setSwipeOffset(prev => ({ ...prev, [bookingId]: offset }))
      setSwipeDirection(prev => ({ ...prev, [bookingId]: 'left' }))
    }
  }

  function handleTouchEnd(bookingId: string) {
    const offset = swipeOffset[bookingId] || 0
    const direction = swipeDirection[bookingId]

    if (direction === 'left' && offset < -50) {
      removeAttendee(bookingId)
    }

    setSwipeOffset(prev => {
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setSwipeDirection(prev => {
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setSwipingId(null)
    touchStartX.current[bookingId] = 0
    touchStartY.current[bookingId] = 0
  }

  async function saveChatSettings(newEnabled: boolean, newMode: 'open' | 'host_only') {
    setSavingChat(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const res = await fetch(`/api/events/${resolvedId}/chat/toggle`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ chat_enabled: newEnabled, chat_mode: newMode }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        console.error('Failed to update chat settings:', json.error)
      }
    } catch (err) {
      console.error('saveChatSettings error:', err)
    } finally {
      setSavingChat(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Event not found</div>
      </div>
    )
  }

  const eventEndAt = getEventEndTime(event)
  const eventHasEnded = !Number.isNaN(eventEndAt.getTime()) && new Date() >= eventEndAt
  const noShowCandidates = getNoShowPenaltyCandidates()
  const parsedPenaltyCredits = Math.max(0, Math.floor(Number(noShowPenaltyCredits || '0')))
  const canProcessNoShowPenalties = eventHasEnded
  const showNoShowPenaltySection = Number(event.credits_required || 0) <= 0

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 space-y-3">
          {/* Title row */}
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/events/${resolvedId}`}
              className="text-blue-600 hover:text-blue-800 p-1 -ml-1 rounded hover:bg-gray-100 shrink-0"
              aria-label="Back to Event Details"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 truncate">Attendance</h1>
          </div>
          {/* Actions row */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                setEmailSubject(`Thanks for joining "${event?.title}" — we'd love your thoughts 🎤`)
                setEmailCustomNote('')
                setEmailPreviewMode('edit')
                setEmailSendResult(null)
                setEmailDialogOpen(true)
              }}
            >
              <Mail className="h-4 w-4" />
              Email Attendees
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setCommunitiesDialogOpen(true)}
            >
              <Users className="h-4 w-4" />
              Communities
            </Button>
          </div>
        </div>
      </div>

      <EventCommunitiesDialog eventId={resolvedId} open={communitiesDialogOpen} onOpenChange={setCommunitiesDialogOpen} />

      {/* Email Attendees Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-violet-600" />
              Email Attendees
            </DialogTitle>
          </DialogHeader>

          {emailSendResult ? (
            /* ── Success state ── */
            <div className="py-6 text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Send className="h-7 w-7 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold">Emails sent!</h3>
              <p className="text-muted-foreground text-sm">
                <span className="font-medium text-foreground">{emailSendResult.emailsSent}</span> email{emailSendResult.emailsSent !== 1 ? 's' : ''} sent
                {emailSendResult.skipped > 0 && (
                  <span className="ml-1">· {emailSendResult.skipped} skipped (already received or no email)</span>
                )}
              </p>
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Tab toggle */}
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
                <button
                  type="button"
                  onClick={() => setEmailPreviewMode('edit')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    emailPreviewMode === 'edit' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Compose
                </button>
                <button
                  type="button"
                  onClick={() => setEmailPreviewMode('preview')}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                    emailPreviewMode === 'preview' ? 'bg-white shadow text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </button>
              </div>

              {emailPreviewMode === 'edit' ? (
                <div className="space-y-4">
                  {/* Recipient info */}
                  <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-800">
                    Will be sent to all <strong>confirmed</strong> performers and attendees
                    {stats.confirmed > 0 && (
                      <span className="ml-1">({stats.confirmed} {stats.confirmed === 1 ? 'person' : 'people'})</span>
                    )}.
                    Anyone who already received this email will be skipped.
                  </div>

                  {/* Subject */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email-subject">Subject line</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Email subject…"
                    />
                  </div>

                  {/* Custom note */}
                  <div className="space-y-1.5">
                    <Label htmlFor="email-custom-note">
                      Personal note from you{' '}
                      <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      id="email-custom-note"
                      value={emailCustomNote}
                      onChange={(e) => setEmailCustomNote(e.target.value)}
                      placeholder='Add a personal message that appears at the top of the email, e.g. "What a night! Thank you all for making this show so special."'
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground">
                      This note will appear in a green box at the top of the email body, before the feedback section.
                    </p>
                  </div>

                  {/* What's included */}
                  <div className="rounded-lg border p-4 space-y-2">
                    <p className="text-sm font-medium">What the email includes:</p>
                    <ul className="text-sm text-muted-foreground space-y-1.5">
                      <li className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 mt-0.5 text-violet-500 shrink-0" />
                        <span>A feedback form link — name is optional so they can respond anonymously</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <Star className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                        <span>A Google review prompt for the venue (if the venue has a review link set up)</span>
                      </li>
                    </ul>
                  </div>
                </div>
              ) : (
                /* ── Preview mode ── */
                <div className="rounded-xl border overflow-hidden text-sm shadow-sm">
                  {/* Email header */}
                  <div className="bg-gradient-to-r from-violet-700 to-indigo-600 px-6 py-7 text-white text-center">
                    <p className="text-violet-200 uppercase tracking-widest text-xs mb-1">One Mic Stand</p>
                    <h2 className="text-xl font-bold">Thanks for a great show! 🎤</h2>
                    <p className="text-violet-200 mt-1 text-sm">{event?.title}</p>
                  </div>

                  {/* Email body */}
                  <div className="bg-white px-6 py-6 space-y-4">
                    <p className="text-gray-800">Hi <span className="italic text-gray-500">[Attendee Name]</span>,</p>
                    <p className="text-gray-700 leading-relaxed">
                      Thank you for being part of <strong>{event?.title}</strong> at <span className="italic text-gray-500">[Venue Name]</span> on{' '}
                      {event ? formatDateTime(event.date) : '…'}. We hope you had a fantastic time and made some great memories!
                    </p>

                    {emailCustomNote && (
                      <div className="bg-green-50 border-l-4 border-green-500 rounded-r-lg px-4 py-3">
                        <p className="text-green-800 whitespace-pre-line">{emailCustomNote}</p>
                      </div>
                    )}

                    {/* Feedback box */}
                    <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 space-y-2">
                      <p className="font-semibold text-violet-900">💬 Share Your Feedback</p>
                      <p className="text-violet-700 text-xs leading-relaxed">
                        Your feedback helps us make every event better. It only takes 2 minutes — and every response genuinely matters.
                      </p>
                      <p className="text-violet-600 text-xs italic">🔒 Your name is completely optional — feel free to respond anonymously.</p>
                      <div className="mt-2">
                        <span className="inline-block bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-lg">Give Feedback →</span>
                      </div>
                    </div>

                    {/* Venue review placeholder */}
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 space-y-2">
                      <p className="font-semibold text-amber-900">⭐ Support <span className="italic text-amber-700">[Venue Name]</span></p>
                      <p className="text-amber-700 text-xs leading-relaxed">
                        Venues are the backbone of live comedy and open-mic culture. A quick Google review means the world to them!
                      </p>
                      <div className="mt-2">
                        <span className="inline-block bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg">Leave a Review on Google ⭐</span>
                      </div>
                      <p className="text-amber-600 text-xs italic">
                        Only shown if the venue has a Google review link in its profile.
                      </p>
                    </div>

                    <p className="text-gray-500 text-xs border-t pt-3">
                      Thanks again for being part of the One Mic Stand community. See you at the next show! 🎭
                    </p>
                  </div>

                  {/* Email footer */}
                  <div className="bg-gray-50 px-6 py-3 text-center text-xs text-gray-400 border-t">
                    © 2025 One Mic Stand · You received this because you attended or performed at one of our events.
                  </div>
                </div>
              )}

              <DialogFooter className="pt-2">
                <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={sendingEmails}>
                  Cancel
                </Button>
                <Button
                  disabled={sendingEmails || !emailSubject.trim()}
                  onClick={async () => {
                    setSendingEmails(true)
                    try {
                      const { data: sessionData } = await supabase.auth.getSession()
                      const token = sessionData.session?.access_token
                      const res = await fetch('/api/send-post-event-feedback', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({
                          eventId: resolvedId,
                          subject: emailSubject,
                          customNote: emailCustomNote || undefined,
                        }),
                      })
                      const json = await res.json()
                      if (!res.ok) throw new Error(json.error || 'Failed to send')
                      setEmailSendResult({ emailsSent: json.emailsSent, skipped: json.skipped })
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : 'Failed to send emails')
                    } finally {
                      setSendingEmails(false)
                    }
                  }}
                  className="gap-2"
                >
                  {sendingEmails ? (
                    <>
                      <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                      Sending…
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send to All Attendees
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">{event.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(event.date)}
            </p>
          </CardHeader>
          <CardContent>
            {/* Host Section - Only show if user can manage hosts */}
            {canManageHost && (
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h3 className="text-lg font-semibold">Event Host</h3>
                  <Button
                    onClick={() => {
                      if (showReplaceHostPanel) {
                        setShowReplaceHostPanel(false)
                        setHostSearch('')
                        setHostSearchResults([])
                        setHostSearchLoading(false)
                        return
                      }
                      setShowReplaceHostPanel(true)
                    }}
                    disabled={updating === 'host'}
                    variant="outline"
                    size="sm"
                  >
                    {showReplaceHostPanel ? 'Hide' : 'Replace Host'}
                  </Button>
                </div>
                <div
                  onDragOver={handleHostDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "min-h-[100px] p-4 rounded-lg border-2 border-dashed transition-colors",
                    isDraggingOverHost
                      ? "bg-indigo-100 border-indigo-400"
                      : hostProfile
                      ? "bg-indigo-50 border-indigo-200"
                      : "bg-gray-50 border-gray-300"
                  )}
                >
                  {hostProfile ? (
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {getInitials(hostProfile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold text-indigo-900">{hostProfile.full_name}</p>
                        <p className="text-sm text-indigo-700">Host</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center min-h-[72px]">
                      <div>
                        <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600 mb-1">No host assigned</p>
                        <p className="text-sm text-gray-500">Drag an attendee here to assign as host</p>
                      </div>
                    </div>
                  )}
                </div>
                {showReplaceHostPanel && (
                  <div className="mt-3 p-3 border rounded-lg bg-white space-y-2">
                    <label className="block text-xs text-muted-foreground">Search user</label>
                    <input
                      type="text"
                      value={hostSearch}
                      onChange={(e) => searchHostCandidates(e.target.value)}
                      placeholder="Search all users by name or email"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Replacing host does not auto-add attendees and does not charge credits.
                    </p>
                    {hostSearch.trim().length < 2 ? (
                      <p className="text-sm text-muted-foreground">Type at least 2 characters to search users.</p>
                    ) : hostSearchLoading ? (
                      <p className="text-sm text-muted-foreground">Searching users...</p>
                    ) : hostSearchResults.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No users found.</p>
                    ) : (
                      <div className="max-h-52 overflow-auto space-y-1">
                        {hostSearchResults.map((candidate) => {
                          const isCurrentHost = hostProfile?.id === candidate.id
                          return (
                            <button
                              key={candidate.id}
                              type="button"
                              className={cn(
                                'w-full text-left px-3 py-2 rounded border text-sm transition-colors',
                                isCurrentHost
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                  : 'hover:bg-gray-50'
                              )}
                              disabled={updating === 'host' || isCurrentHost}
                              onClick={async () => {
                                await setHost(candidate.id)
                                setShowReplaceHostPanel(false)
                                setHostSearch('')
                                setHostSearchResults([])
                              }}
                            >
                              <div className="font-medium truncate">{candidate.full_name || 'No name'}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {isCurrentHost ? 'Current host' : candidate.email || 'No email'}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {showNoShowPenaltySection && (
              <div className="border-t pt-4 mt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">No-show penalty (free performer spots)</h3>
                    <p className="text-xs text-muted-foreground">
                      Applies when a performer books a free spot and is not marked attended by event end time.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowNoShowPenaltyTools((prev) => !prev)}
                    aria-label={showNoShowPenaltyTools ? 'Hide no-show penalty settings' : 'Show no-show penalty settings'}
                  >
                    <ChevronDown className={cn('h-4 w-4 transition-transform', showNoShowPenaltyTools && 'rotate-180')} />
                  </Button>
                </div>
                {showNoShowPenaltyTools && (
                  <div className="mt-3 space-y-3 rounded-lg border p-3 bg-white">
                    {!noShowPenaltyFeatureAvailable && (
                      <p className="text-xs text-amber-700">
                        No-show penalty columns are missing on this environment. Run `no_show_penalty_settings_migration.sql` in production to enable these controls.
                      </p>
                    )}
                    <label className="flex items-center justify-between text-sm gap-3">
                      <span>Enable no-show penalty for free performer bookings</span>
                      <input
                        type="checkbox"
                        checked={noShowPenaltyEnabled}
                        onChange={(e) => setNoShowPenaltyEnabled(e.target.checked)}
                        disabled={!noShowPenaltyFeatureAvailable}
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-sm">Penalty amount (credits)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={noShowPenaltyCredits}
                        onChange={(e) => setNoShowPenaltyCredits(e.target.value)}
                        className="w-24 px-2 py-1.5 border rounded-md text-sm"
                        disabled={!noShowPenaltyFeatureAvailable}
                      />
                      <span className="text-xs text-muted-foreground">Default is 5 credits ($5 equivalent).</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      If the account balance is insufficient, credits can go negative and the performer must top up later.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Eligible now: {noShowCandidates.length} booking{noShowCandidates.length === 1 ? '' : 's'} •
                      Estimated charge: {noShowCandidates.length * parsedPenaltyCredits} credits
                    </p>
                    <div>
                      <Button size="sm" onClick={saveNoShowPenaltySettings} disabled={savingNoShowPenalty || !noShowPenaltyFeatureAvailable}>
                        {savingNoShowPenalty ? 'Saving...' : 'Save penalty settings'}
                      </Button>
                    </div>
                    <div className="pt-2 border-t space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {eventHasEnded
                          ? 'Event has ended. You can now process no-show penalties.'
                          : `Processing will unlock after event end time (${formatDateTime(event.end_time || event.date)}).`}
                      </p>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={processNoShowPenaltiesForEvent}
                        disabled={processingNoShowPenalties || !canProcessNoShowPenalties || !noShowPenaltyFeatureAvailable}
                      >
                        {processingNoShowPenalties ? 'Processing penalties...' : 'Process no-show penalties'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mb-4">
          <Button type="button" variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href={`/events/${resolvedId}/hosting-info`}>
              <Clock className="h-4 w-4" />
              Hosting info
            </Link>
          </Button>
        </div>

        {/* Event Chat Settings */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Event Chat</CardTitle>
              </div>
              <Switch
                checked={chatEnabled}
                disabled={savingChat}
                onCheckedChange={async (checked) => {
                  setChatEnabled(checked)
                  await saveChatSettings(checked, chatMode)
                }}
                aria-label="Enable chat"
              />
            </div>
          </CardHeader>
          {chatEnabled && (
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Chat is visible to confirmed performers on the event page.
              </p>
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium">Chat mode</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setChatMode('open')
                      await saveChatSettings(chatEnabled, 'open')
                    }}
                    disabled={savingChat}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      chatMode === 'open'
                        ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                        : 'border-gray-200 text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    Everyone can send
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setChatMode('host_only')
                      await saveChatSettings(chatEnabled, 'host_only')
                    }}
                    disabled={savingChat}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      chatMode === 'host_only'
                        ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                        : 'border-gray-200 text-muted-foreground hover:bg-gray-50'
                    }`}
                  >
                    Host only
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {bookings.length} performer{bookings.length === 1 ? '' : 's'} can access this chat.
              </p>
            </CardContent>
          )}
        </Card>

        {/* Bookings List */}
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{attendeeTab === 'performers' ? `Confirmed Bookings (${bookings.length})` : `Audience (${audienceBookings.length})`}</CardTitle>
              {attendeeTab === 'performers' && (
                <Button variant="outline" size="icon" onClick={copyAttendanceList} aria-label="Copy attendance list">
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Tabs value={attendeeTab} onValueChange={(value) => setAttendeeTab(value as 'performers' | 'audience')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="performers">Performers</TabsTrigger>
                <TabsTrigger value="audience">Audience</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {attendeeTab === 'performers' ? (
              <div
                onDragOver={handleConfirmedDragOver}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDropToStatus('confirmed')}
                className={cn(
                  isDraggingOverConfirmed && "rounded-lg bg-blue-50 border border-blue-200"
                )}
              >
                {bookings.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No confirmed bookings for this event</p>
                ) : (
                  <div className="space-y-2">
                    {groupBookingsByArtType(bookings).map(([artType, artTypeBookings]) => (
                      <div key={artType} className="space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          {artType} ({artTypeBookings.length})
                        </p>
                        {artTypeBookings.map((booking, index) => {
                          const attendanceStatus = booking.attendance_status
                          const isUpdating = updating === booking.id
                          const isDragged = draggedItem === booking.id
                          const isDragOver = dragOverIndex === index

                          return (
                            <div
                              key={booking.id}
                              draggable
                              onDragStart={(e) => handleDragStart(e, booking.id)}
                              onDragOver={(e) => handleDragOver(e, index)}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              onTouchStart={(e) => handleTouchStart(e, booking.id)}
                              onTouchMove={(e) => handleTouchMove(e, booking.id)}
                              onTouchEnd={() => handleTouchEnd(booking.id)}
                              style={{ transform: `translateX(${swipeOffset[booking.id] || 0}px)` }}
                              className={cn(
                                "flex items-center gap-2 sm:gap-3 p-3 rounded-lg border transition-all cursor-move",
                                isDragged && "opacity-50",
                                isDragOver && "border-blue-400 bg-blue-50",
                                !isDragged && !isDragOver && "hover:bg-gray-50"
                              )}
                            >
                              <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />

                              <div className="flex-1 min-w-0">
                                <Link
                                  href={`/profile/${booking.profiles.id}`}
                                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {booking.profiles.full_name || 'No name'}
                                </Link>
                                <span className="hidden sm:inline text-xs text-muted-foreground">
                                  {formatDateTime(booking.booked_at)}
                                </span>
                              </div>

                              <div className="flex items-center gap-2 flex-shrink-0">
                                <Switch
                                  checked={attendanceStatus === 'attended'}
                                  disabled={isUpdating}
                                  onCheckedChange={(checked) => updateAttendance(booking.id, checked ? 'attended' : null)}
                                  aria-label="Mark attended"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                )}
                <div
                  className={cn("mt-6 rounded-lg", isDraggingOverWaitlist && "bg-blue-50 border border-blue-200")}
                  onDragOver={handleWaitlistDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={() => handleDropToStatus('waitlist')}
                >
                  <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                    Waitlist ({waitlistBookings.length})
                  </h3>
                  {waitlistBookings.length === 0 ? (
                    <p className="text-muted-foreground text-center py-6 text-sm">No waitlisted attendees</p>
                  ) : (
                    <div className="space-y-2">
                      {groupBookingsByArtType(waitlistBookings).map(([artType, artTypeBookings]) => (
                        <div key={`waitlist-${artType}`} className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {artType} ({artTypeBookings.length})
                          </p>
                          {artTypeBookings.map((booking) => {
                            const isUpdating = updating === booking.id
                            return (
                              <div
                                key={booking.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, booking.id)}
                                className="flex items-center gap-2 sm:gap-3 p-3 rounded-lg border transition-all hover:bg-gray-50"
                              >
                                <span className="text-xs font-semibold text-muted-foreground w-6 text-center">
                                  {booking.waitlist_position ?? '-'}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <Link
                                    href={`/profile/${booking.profiles.id}`}
                                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                                  >
                                    {booking.profiles.full_name || 'No name'}
                                  </Link>
                                </div>
                                {isUpdating && (
                                  <span className="text-xs text-muted-foreground">Updating...</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {(() => {
                  const canMarkAudience = isAudienceAttendanceWindowOpen()
                  const filtered = audienceBookings
                    .filter((booking) => {
                      if (audienceFilter === 'checked_in') return booking.attendance_status === 'attended'
                      if (audienceFilter === 'not_arrived') return booking.attendance_status !== 'attended'
                      return true
                    })
                    .filter((booking) =>
                      (booking.profiles.full_name || '')
                        .toLowerCase()
                        .includes(audienceSearch.trim().toLowerCase())
                    )
                  const checkedInCount = audienceBookings.filter((booking) => booking.attendance_status === 'attended').length

                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant={audienceFilter === 'all' ? 'default' : 'outline'} onClick={() => setAudienceFilter('all')}>
                          All
                        </Button>
                        <Button size="sm" variant={audienceFilter === 'checked_in' ? 'default' : 'outline'} onClick={() => setAudienceFilter('checked_in')}>
                          Checked In
                        </Button>
                        <Button size="sm" variant={audienceFilter === 'not_arrived' ? 'default' : 'outline'} onClick={() => setAudienceFilter('not_arrived')}>
                          Not Yet Arrived
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          type="text"
                          value={audienceSearch}
                          onChange={(e) => setAudienceSearch(e.target.value)}
                          placeholder="Search audience by name"
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        />
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={audienceCheckinCodeInput}
                            onChange={(e) => setAudienceCheckinCodeInput(e.target.value)}
                            placeholder="Check-in code (AUD-XXXXXX)"
                            className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            type="button"
                            onClick={() => {
                              setScannerMode('audience')
                              startScanner()
                            }}
                          >
                            Scan
                          </Button>
                          <Button size="sm" onClick={markAudienceByCode}>
                            Mark
                          </Button>
                        </div>
                      </div>
                      {scannerActive && scannerMode === 'audience' && (
                        <div className="rounded-lg border p-2 bg-black/5">
                          {scannerEngine === 'native' && (
                            <video
                              ref={scannerVideoRef}
                              className="w-full rounded-md max-h-64 min-h-40 object-cover bg-black"
                              playsInline
                              muted
                              autoPlay
                            />
                          )}
                          {scannerEngine === 'html5' && (
                            <div id={html5ScannerElementId} className="w-full" />
                          )}
                        </div>
                      )}
                      {scannerActive && scannerMode === 'audience' && (
                        <div className="flex items-center gap-2">
                          <Button type="button" variant="outline" size="sm" onClick={stopScanner}>
                            Stop scanner
                          </Button>
                          {scannerMessage && <span className="text-xs text-muted-foreground">{scannerMessage}</span>}
                        </div>
                      )}

                      <div className="text-sm text-muted-foreground">
                        {checkedInCount} of {audienceBookings.length} checked in
                        {!canMarkAudience && (
                          <span className="ml-2 text-red-600">
                            Attendance marking is closed right now.
                          </span>
                        )}
                      </div>

                      {filtered.length === 0 ? (
                        <p className="text-muted-foreground text-center py-8">No audience members match this filter.</p>
                      ) : (
                        <div className="space-y-2">
                          {filtered.map((booking) => {
                            const isUpdating = updating === booking.id
                            return (
                              <div key={booking.id} className="flex items-center gap-3 p-3 rounded-lg border">
                                <div className="flex-1 min-w-0">
                                  <Link
                                    href={`/profile/${booking.profiles.id}`}
                                    className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                                  >
                                    {booking.profiles.full_name || 'No name'}
                                  </Link>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {booking.audience_checkin_code || 'No check-in code'}
                                  </p>
                                </div>
                                <Switch
                                  checked={booking.attendance_status === 'attended'}
                                  disabled={isUpdating || !canMarkAudience}
                                  onCheckedChange={(checked) => updateAttendance(booking.id, checked ? 'attended' : null)}
                                  aria-label="Mark audience attended"
                                />
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Issue Refunds</CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowRefundTools(!showRefundTools)}
                aria-label={showRefundTools ? 'Hide refund tools' : 'Show refund tools'}
              >
                <ChevronDown className={cn('h-4 w-4 transition-transform', showRefundTools && 'rotate-180')} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select attendees and issue full or specific refunds (capped by refundable balance).
            </p>
            {showRefundTools && (
              <>
                {(() => {
                  const refundCandidates = [...bookings, ...audienceBookings]
                  const allSelected = refundCandidates.length > 0 && selectedRefundBookingIds.size === refundCandidates.length
                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={refundMode === 'full' ? 'default' : 'outline'}
                          onClick={() => setRefundMode('full')}
                        >
                          Refund full
                        </Button>
                        <Button
                          size="sm"
                          variant={refundMode === 'specific' ? 'default' : 'outline'}
                          onClick={() => setRefundMode('specific')}
                        >
                          Refund specific
                        </Button>
                        {refundMode === 'specific' && (
                          <input
                            type="number"
                            min="1"
                            value={refundAmount}
                            onChange={(e) => setRefundAmount(e.target.value)}
                            className="w-28 px-3 py-1.5 border border-gray-300 rounded-md text-sm"
                            placeholder="Credits"
                          />
                        )}
                      </div>

                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRefundBookingIds(new Set(refundCandidates.map((b) => b.id)))
                              } else {
                                setSelectedRefundBookingIds(new Set())
                              }
                            }}
                          />
                          Select all
                        </label>
                        <span className="text-xs text-muted-foreground">
                          {selectedRefundBookingIds.size} selected
                        </span>
                      </div>

                      <div className="max-h-64 overflow-auto space-y-2 pr-1">
                        {refundCandidates.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No attendees available.</p>
                        ) : (
                          refundCandidates.map((booking) => (
                            <label key={booking.id} className="flex items-center justify-between gap-2 p-2 border rounded-md">
                              <span className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={selectedRefundBookingIds.has(booking.id)}
                                  onChange={(e) => {
                                    const next = new Set(selectedRefundBookingIds)
                                    if (e.target.checked) {
                                      next.add(booking.id)
                                    } else {
                                      next.delete(booking.id)
                                    }
                                    setSelectedRefundBookingIds(next)
                                  }}
                                />
                                <span className="text-sm truncate">{booking.profiles.full_name || booking.profiles.email || 'Attendee'}</span>
                              </span>
                              <span className="text-xs text-muted-foreground whitespace-nowrap">
                                Paid: {Number(booking.credits_used || 0)} cr
                              </span>
                            </label>
                          ))
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <Button onClick={submitBatchRefunds} disabled={refundLoading || selectedRefundBookingIds.size === 0}>
                          {refundLoading ? 'Processing...' : 'Issue refunds'}
                        </Button>
                        {refundMessage && <span className="text-sm text-green-700">{refundMessage}</span>}
                        {refundError && <span className="text-sm text-red-600">{refundError}</span>}
                      </div>
                    </>
                  )
                })()}
              </>
            )}
          </CardContent>
        </Card>

        {event.food_coupon_enabled && (
          <Card className="mt-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Redeem Coupon</CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (showRedeemTools && scannerActive) {
                      stopScanner()
                    }
                    setShowRedeemTools(!showRedeemTools)
                  }}
                  aria-label={showRedeemTools ? 'Hide redeem tools' : 'Show redeem tools'}
                >
                  <ChevronDown className={cn('h-4 w-4 transition-transform', showRedeemTools && 'rotate-180')} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {recentRedemptions.length} recent redemption{recentRedemptions.length === 1 ? '' : 's'}
              </p>
              {showRedeemTools && (
                <>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Coupon code</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={redeemCode}
                        onChange={(e) => {
                          setRedeemCode(e.target.value)
                          setRedeemPreview(null)
                        }}
                        placeholder="LB-XXXXXXXX"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <Button type="button" variant="outline" onClick={() => lookupVoucher()} disabled={!redeemCode.trim()}>
                        Lookup
                      </Button>
                    </div>
                  </div>
                  {redeemPreview && (
                    <div className="rounded-md border p-3 text-sm bg-muted/30">
                      <p className="font-medium">{redeemPreview.attendeeName}</p>
                      <p className="text-xs text-muted-foreground">{redeemPreview.code}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline">${(redeemPreview.valueCents / 100).toFixed(2)}</Badge>
                        <Badge variant={redeemPreview.canRedeem ? 'secondary' : 'destructive'}>
                          {redeemPreview.canRedeem ? 'Ready to redeem' : redeemPreview.status}
                        </Badge>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {!scannerActive ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setScannerMode('coupon')
                          startScanner()
                        }}
                      >
                        Scan QR with camera
                      </Button>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={stopScanner}>
                        Stop scanner
                      </Button>
                    )}
                    {!scannerSupported && (
                      <span className="text-xs text-muted-foreground">QR scanning unavailable on this browser</span>
                    )}
                  </div>
                  {scannerActive && (
                    <div className="rounded-lg border p-2 bg-black/5">
                      {scannerEngine === 'native' && (
                        <video
                          ref={scannerVideoRef}
                          className="w-full rounded-md max-h-64 min-h-40 object-cover bg-black"
                          playsInline
                          muted
                          autoPlay
                        />
                      )}
                      {scannerEngine === 'html5' && (
                        <div id={html5ScannerElementId} className="w-full" />
                      )}
                    </div>
                  )}
                  {scannerMessage && <p className="text-xs text-muted-foreground">{scannerMessage}</p>}
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Coupon amount (auto-filled)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={redeemOrderTotal}
                      onChange={(e) => setRedeemOrderTotal(e.target.value)}
                      placeholder="e.g. 24.50"
                      disabled
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
                    <input
                      type="text"
                      value={redeemNotes}
                      onChange={(e) => setRedeemNotes(e.target.value)}
                      placeholder="Optional note for redemption log"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Button onClick={redeemCoupon} disabled={redeemLoading}>
                      {redeemLoading ? 'Redeeming...' : 'Redeem coupon'}
                    </Button>
                    {redeemMessage && <span className="text-sm text-green-700">{redeemMessage}</span>}
                    {redeemError && <span className="text-sm text-red-600">{redeemError}</span>}
                  </div>

                  <div className="pt-2 border-t">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Recent redemptions</p>
                    {recentRedemptions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No coupons redeemed yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {recentRedemptions.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{item.attendeeLabel}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {formatDateTime(item.redeemedAt)}
                              </p>
                            </div>
                            <span className="text-sm font-medium">${(item.valueCents / 100).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {event.event_type === 'booked_show' && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg">Send Invites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">
                  Invite link {inviteLink ? `(${inviteLink.uses}/${inviteLink.max_uses} used)` : ''}
                </div>
                <div className="flex items-center gap-2">
                  {inviteLink && (
                    <Button variant="outline" size="sm" onClick={copyInviteLink}>
                      Copy link
                    </Button>
                  )}
                  {!inviteLink && (
                    <Button size="sm" onClick={createInviteLink} disabled={inviteLoading}>
                      Create link
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowInviteAdvanced(!showInviteAdvanced)}
                    aria-label={showInviteAdvanced ? 'Hide invite options' : 'Show invite options'}
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", showInviteAdvanced && "rotate-180")} />
                  </Button>
                </div>
              </div>

              {showInviteAdvanced && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Max uses</label>
                    <input
                      type="number"
                      min="1"
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Expiry</label>
                    <input
                      type="datetime-local"
                      value={inviteExpiresAt}
                      onChange={(e) => setInviteExpiresAt(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-muted-foreground mb-1">Search users</label>
                <input
                  type="text"
                  value={inviteSearch}
                  onChange={(e) => searchInvitees(e.target.value)}
                  placeholder="Search users by name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {inviteLoading && (
                <p className="text-sm text-muted-foreground">Searching...</p>
              )}
              {inviteResults.length > 0 && (
                <div className="space-y-2">
                  {inviteResults.map((profile) => {
                    const alreadyConfirmed = bookings.some((b) => b.user_id === profile.invited_user_id)
                    const alreadyWaitlist = waitlistBookings.some((b) => b.user_id === profile.invited_user_id)
                    const existingInvite = invites.find((invite) => invite.invited_user_id === profile.invited_user_id)
                    const statusLabel = alreadyConfirmed
                      ? 'Confirmed'
                      : alreadyWaitlist
                        ? 'Waitlist'
                        : existingInvite?.status === 'pending'
                          ? 'Pending'
                          : existingInvite?.status === 'accepted'
                            ? 'Accepted'
                            : existingInvite?.status === 'declined'
                              ? 'Declined'
                              : ''

                    return (
                      <div
                        key={profile.invited_user_id}
                        className="flex items-center justify-between gap-3 p-2 border rounded-lg"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{profile.profiles.full_name || 'No name'}</p>
                          <p className="text-xs text-muted-foreground truncate">{profile.profiles.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {statusLabel && (
                            <span className="text-xs text-muted-foreground">{statusLabel}</span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={alreadyConfirmed || alreadyWaitlist || existingInvite?.status === 'pending'}
                            onClick={() => sendInvite(profile.invited_user_id)}
                          >
                            Invite
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {inviteSearch.length >= 2 && inviteResults.length === 0 && !inviteLoading && (
                <p className="text-sm text-muted-foreground">No users found.</p>
              )}

              <div className="pt-2 border-t">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Invite History</p>
                <div className="space-y-2">
                  {invites.length === 0 && (
                    <p className="text-sm text-muted-foreground">No invites sent yet.</p>
                  )}
                  {invites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-3 p-2 border rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{invite.profiles.full_name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{invite.profiles.email}</p>
                      </div>
                      <span className="text-xs text-muted-foreground capitalize">{invite.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats - Moved to bottom */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6">
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Total Registered</div>
              <div className="text-xl md:text-2xl font-bold text-blue-700">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Attended</div>
              <div className="text-xl md:text-2xl font-bold text-green-700">{stats.attended}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">No Show</div>
              <div className="text-xl md:text-2xl font-bold text-red-700">{stats.noShow}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Pending</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-700">{stats.pending}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Navigation */}
</div>
  )
}
