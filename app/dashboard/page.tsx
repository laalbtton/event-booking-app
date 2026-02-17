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
import { cn } from '@/lib/utils'
import { QRCodeSVG } from 'qrcode.react'
import { Copy } from 'lucide-react'

type MyCoupon = {
  id: string
  eventTitle: string
  eventDate: string | null
  code: string
  valueCents: number
  status: 'issued' | 'redeemed' | 'cancelled' | 'expired'
  expiresAt: string | null
}

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState<string | null>(null)
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleRequestStatus, setRoleRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
  const [eventTab, setEventTab] = useState<'perform' | 'attend'>('perform')
  const [myActivityTab, setMyActivityTab] = useState<'bookings' | 'coupons'>('bookings')
  const [invitedEventIds, setInvitedEventIds] = useState<Set<string>>(new Set())
  const [myCoupons, setMyCoupons] = useState<MyCoupon[]>([])
  const previousBookingsRef = useRef<any[]>([])
  const [settingAlert, setSettingAlert] = useState<string | null>(null)
  const [alertSet, setAlertSet] = useState<Set<string>>(new Set())
  const router = useRouter()

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

  function formatCouponStatus(status: MyCoupon['status']) {
    if (status === 'issued') return 'Issued'
    if (status === 'redeemed') return 'Redeemed'
    if (status === 'expired') return 'Expired'
    return 'Cancelled'
  }

  function copyCouponCode(code: string) {
    navigator.clipboard.writeText(code)
    alert('Coupon code copied!')
  }

  async function loadMyCoupons(userId: string) {
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token
    if (!accessToken) {
      setMyCoupons([])
      return
    }

    const response = await fetch('/api/vouchers/my', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(result.error || 'Failed to load coupons')
    }

    const vouchers = Array.isArray(result.vouchers) ? result.vouchers : []
    const scoped = vouchers.filter((voucher: any) => voucher && voucher.id && voucher.code)
    setMyCoupons(
      scoped.map((voucher: any) => ({
        id: voucher.id,
        eventTitle: voucher.eventTitle || 'Event',
        eventDate: voucher.eventDate || null,
        code: voucher.code,
        valueCents: Number(voucher.valueCents || 0),
        status: voucher.status,
        expiresAt: voucher.expiresAt || null,
      }))
    )
  }

  useEffect(() => {
    checkAuth()
  }, [])

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

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
    }

    // Check user role
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profileError && profile) {
      setUserRole(profile.role)
      setIsAdmin(profile.role === 'admin')
    } else {
      // Fallback: check admin_users table for backward compatibility
      const { data: adminData } = await supabase
        .from('admin_users')
        .select('*')
        .eq('user_id', user.id)
        .single()

    setIsAdmin(!!adminData)
    setUserRole(adminData ? 'admin' : 'performer')
    }

    // Check for existing role change request
    const { data: requestData } = await supabase
      .from('role_change_requests')
      .select('status')
      .eq('user_id', user.id)
      .eq('requested_role', 'event_creator')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (requestData) {
      setRoleRequestStatus(requestData.status)
    }

    loadData(user.id)
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
          .select('event_id, status')
          .in('event_id', eventIds)
          .eq('status', 'confirmed')

        if (!countsError && confirmedCountsData) {
          const counts: Record<string, number> = {}
          confirmedCountsData.forEach(booking => {
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

      await loadMyCoupons(userId)

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

  async function handleBookEvent(event: Event) {
    if (!profile) return

    setBookingLoading(event.id)
    setError('')

    try {
      if (event.tickets_enabled) {
        throw new Error('This event uses external tickets')
      }
      if (event.event_type === 'booked_show') {
        throw new Error('This show is invite-only')
      }
      if (event.status === 'cancelled') {
        throw new Error('This event has been cancelled')
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

      const effectiveCreditsRequired = getEffectiveCreditsRequired(event)
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
        body: JSON.stringify({ eventId: event.id }),
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
        alert('Event is full. You have been added to the waitlist. You will be notified if a spot opens up.')
      } else if (result.voucher) {
        alert(`Event booked successfully! Food coupon issued: ${result.voucher.code}`)
      } else {
        alert('Event booked successfully!')
      }

    } catch (error: any) {
      setError(error.message)
      
      // Better error message if capacity is reached
      if (error.message.includes('full capacity')) {
        alert('Event is at full capacity. You have been added to the waitlist instead.')
        // Retry as waitlist
        // (You could add logic here to automatically try booking as waitlist)
      } else {
        alert(error.message)
      }
    } finally {
      setBookingLoading(null)
    }
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

    // Different messages for confirmed vs waitlist
    let confirmMessage = ''
    if (booking.status === 'waitlist') {
      confirmMessage = isBookedShow
        ? `Remove yourself from the waitlist for "${event.title}"?`
        : `Remove yourself from the waitlist for "${event.title}"?\n\nYou will receive a full refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
    } else {
      confirmMessage = isBookedShow
        ? `Cancel participation for "${event.title}"?`
        : willGetRefund
          ? `Cancel registration for "${event.title}"?\n\nYou will receive a refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
          : `Cancel registration for "${event.title}"?\n\n⚠️ You will NOT receive a refund because cancellation is within ${cancellationWindow} hours of the event.\n\nAre you sure you want to cancel?`
    }

    if (!confirm(confirmMessage)) {
      return
    }

    setCancellingBooking(booking.id)
    setError('')

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) {
        throw new Error('Not authenticated')
      }

      const response = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bookingId: booking.id }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel booking')
      }

      await loadData(profile.id)

      const refundedCredits = Number(result.refundedCredits || 0)
      if (refundedCredits > 0) {
        const voucherNote = result.voucherRefunded ? ' Food coupon credits were also refunded.' : ''
        alert(
          `${booking.status === 'waitlist' ? 'Waitlist removed' : 'Booking cancelled'}. ${refundedCredits} credit${refundedCredits > 1 ? 's have' : ' has'} been refunded to your account.${voucherNote}`
        )
      } else {
        alert('Booking cancelled. No refund issued based on cancellation policy and voucher status.')
      }

    } catch (error: any) {
      setError(error.message)
      alert('Error cancelling booking: ' + error.message)
    } finally {
      setCancellingBooking(null)
    }
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  const activeUpcomingBookings = myBookings.filter(
    (booking) =>
      new Date(booking.events.date) >= currentTime &&
      booking.status !== 'cancelled' &&
      booking.events.status !== 'cancelled'
  )

  return (
    <div className="min-h-screen bg-background">
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

        {/* Credits Card */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-700 border-0 text-white shadow-lg mb-8">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-base sm:text-lg font-semibold mb-3 text-white/90">Welcome, {profile?.full_name}!</h2>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl lg:text-6xl font-bold drop-shadow-md tracking-tight">{profile?.credits || 0}</span>
              <span className="text-lg sm:text-xl ml-1 drop-shadow text-white/90">credits available</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                asChild
                type="button"
                className="bg-white text-blue-700 hover:bg-white/90"
              >
                <Link href="/buy-credits">Buy Credits</Link>
              </Button>
              <Button asChild variant="secondary" className="bg-white/10 text-white hover:bg-white/20">
                <Link href="/credits">Credits History</Link>
              </Button>
            </div>
          </CardContent>
        </Card>


        {error && (
          <Card className="border-destructive bg-destructive/15 mb-6 shadow-sm">
            <CardContent className="p-4">
              <p className="text-destructive text-sm leading-relaxed">{error}</p>
            </CardContent>
          </Card>
        )}

        <div className="mb-8 sm:mb-10">
          <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6 tracking-tight">My Activity</h2>
          <Tabs value={myActivityTab} onValueChange={(value) => setMyActivityTab(value as 'bookings' | 'coupons')}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="bookings">
                <span className="sm:hidden">Bookings</span>
                <span className="hidden sm:inline">My Bookings</span>
              </TabsTrigger>
              <TabsTrigger value="coupons">
                <span className="sm:hidden">Coupons</span>
                <span className="hidden sm:inline">My Coupons</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="bookings">
              {activeUpcomingBookings.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No upcoming bookings yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {activeUpcomingBookings.map((booking) => {
                const eventDate = new Date(booking.events.date)
                const now = currentTime
                const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
                const isBookedShow = booking.events.event_type === 'booked_show'
                const cancellationWindow = isBookedShow ? 0 : (booking.events.cancellation_hours || 4)
                const canCancel = hoursUntilEvent >= 0 && booking.events.status !== 'cancelled'
                const willGetRefund = !isBookedShow && hoursUntilEvent >= cancellationWindow

                // Calculate time display (until event)
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

                // Time left until full-refund window closes
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
                const confirmedCount = eventConfirmedCounts[booking.event_id] || 0
                const spotsLeft = booking.events.max_attendees !== null
                  ? booking.events.max_attendees - confirmedCount
                  : null
                const borderColor = isEventCancelled
                  ? 'border-red-500'
                  : isWaitlist
                    ? 'border-yellow-500'
                    : 'border-green-500'

                return (
                  <Link
                    key={booking.id}
                    href={`/events/${booking.event_id}`}
                    className="block active:opacity-90"
                  >
                    <Card
                      className={cn(
                        "border-l-4 hover:border-primary/60 hover:shadow-sm transition-all active:bg-muted/40",
                        isEventCancelled
                          ? "border-l-red-500"
                          : isWaitlist
                            ? "border-l-yellow-500"
                            : "border-l-green-500"
                      )}
                    >
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-base md:text-lg flex-1">
                          {booking.events.title}
                        </CardTitle>
                        {!isPast && (
                          isEventCancelled ? (
                            <Badge variant="destructive" className="ml-2">
                              Cancelled
                            </Badge>
                          ) : isWaitlist ? (
                            <Badge variant="outline" className="text-yellow-600 border-yellow-600 ml-2">
                              ⏳ #{booking.waitlist_position}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-green-600 border-green-600 ml-2">
                              ✓
                            </Badge>
                          )
                        )}
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
                          {booking.events.max_attendees && spotsLeft !== null && (
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
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <span className="sr-only">Rating</span>
                          </div>
                          <div className="whitespace-nowrap">
                            🔞 {booking.events.rating || '18+'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span>💳</span>
                          {isBookedShow ? (
                            <span>Invite only</span>
                          ) : (
                            <span>{booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                          )}
                        </div>
                        {!isPast ? (
                          <Badge variant="secondary" className="text-xs">
                            ⏰ In {timeDisplay}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            ✓ Completed
                          </Badge>
                        )}
                      </div>

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
                                : 'Cancel Booking'
                            }
                          </Button>

                          {!isBookedShow && (
                            <p className="text-xs text-muted-foreground text-center">
                              {isWaitlist
                                ? `✓ Full refund if you leave waitlist`
                              : willGetRefund 
                                  ? `✓ Full refund available (${refundTimeDisplay} left)`
                                  : `⚠️ No refund (within ${cancellationWindow}h window)`
                              }
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </Link>
                )
              })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="coupons">
              {myCoupons.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No coupons issued yet.
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {myCoupons.map((coupon) => (
                    <Card key={coupon.id} className="border-l-4 border-l-blue-500">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-base md:text-lg line-clamp-2">{coupon.eventTitle}</CardTitle>
                          <Badge
                            variant="outline"
                            className={cn(
                              coupon.status === 'issued' && 'text-blue-600 border-blue-600',
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
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Available Events Section */}
        <div>
          <h2 className="text-xl sm:text-2xl font-bold mb-5 sm:mb-6 tracking-tight">Available Events</h2>

          <Tabs value={eventTab} onValueChange={(value) => setEventTab(value as 'perform' | 'attend')} className="mb-6">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="perform">Perform</TabsTrigger>
              <TabsTrigger value="attend">Attend</TabsTrigger>
            </TabsList>
          </Tabs>

          {(() => {
            const filteredEvents = events.filter((event) =>
              eventTab === 'perform'
                ? event.event_type !== 'booked_show' && !event.tickets_enabled
                : event.event_type === 'booked_show'
                  ? !invitedEventIds.has(event.id)
                  : event.tickets_enabled
            )

            if (filteredEvents.length === 0) {
              return (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    {eventTab === 'perform'
                      ? 'No upcoming events available to perform'
                      : 'No upcoming shows available to attend'}
                  </CardContent>
                </Card>
              )
            }

            return (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredEvents.map((event) => {
                  const activeBooking = myBookings.find(
                    (b) =>
                      b.event_id === event.id &&
                      (b.status === 'confirmed' || b.status === 'waitlist')
                  )
                  const isBooked = !!activeBooking
                  const effectiveCreditsRequired = getEffectiveCreditsRequired(event)
                  const canAfford = (profile?.credits || 0) >= effectiveCreditsRequired
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
                      <Card className="hover:border-primary/60 hover:shadow-sm transition-all active:bg-muted/40">
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
                                <Badge variant="secondary" className="whitespace-nowrap">
                                  {effectiveCreditsRequired} {effectiveCreditsRequired === 1 ? 'credit' : 'credits'}
                                </Badge>
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
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1">
                                <span className="sr-only">Rating</span>
                              </div>
                              <div className="whitespace-nowrap">
                                🔞 {event.rating || '18+'}
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

                          {event.event_type !== 'booked_show' && !event.tickets_enabled && (
                            <div className="flex items-center justify-between gap-2 pt-2 border-t">
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground">
                                  ⏱️ Cancel {event.cancellation_hours || 4}h before
                                </p>
                                {event.food_coupon_enabled && (
                                  <p className="text-xs text-muted-foreground">
                                    Spot fee {event.spot_fee_credits || 0} credits + coupon ${(Math.max(0, Number(event.food_coupon_value_cents || 0)) / 100).toFixed(2)}
                                  </p>
                                )}
                              </div>
                              
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
                                        : 'Book Event'}
                                </Button>
                              )}
                            </div>
                          )}

                          {(event.event_type === 'booked_show' || event.tickets_enabled) && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t">
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