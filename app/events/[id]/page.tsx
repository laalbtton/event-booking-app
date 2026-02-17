'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { sendBookingConfirmationEmail } from '@/lib/emailService'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Copy } from 'lucide-react'



type EventDetails = {
  id: string
  title: string
  description: string
  theme: string | null
  rating: string | null
  status?: string | null
  event_type: 'open_mic' | 'booked_show'
  tickets_enabled: boolean
  external_event: boolean
  external_ticket_url: string | null
  date: string
  end_time: string | null
  location: string
  venue_id: string | null
  credits_required: number
  food_coupon_enabled?: boolean
  spot_fee_credits?: number
  food_coupon_value_cents?: number
  max_attendees: number | null
  cancellation_hours: number
  registration_opens_at: string | null
  host_user_id: string | null
  created_by: string | null
}

type VenueDetails = {
  id: string
  name: string
  address: string
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
}

type AttendeeBooking = {
  id: string
  status: string
  waitlist_position: number | null
  profiles: {
    id: string
    full_name: string
    email: string
  }
}

export default function EventDetailsPage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [confirmedBookings, setConfirmedBookings] = useState<AttendeeBooking[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<AttendeeBooking[]>([])
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


  function copyPublicLink() {
    const publicUrl = `${window.location.origin}/event-public/${eventId}`
    navigator.clipboard.writeText(publicUrl)
    alert('Public link copied to clipboard!')
  }

  function copyAttendeeList() {
    const confirmed = confirmedBookings.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}`
    )
    const waitlist = waitlistBookings.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}`
    )

    let text = `Confirmed Attendees (${confirmed.length})\n${confirmed.join('\n') || 'None'}`
    if (waitlist.length > 0) {
      text += `\n\nWaitlist (${waitlist.length})\n${waitlist.join('\n')}`
    }

    navigator.clipboard.writeText(text)
    alert('Attendee list copied!')
  }

  useEffect(() => {
    loadEventDetails()
  }, [eventId])

  async function loadEventDetails() {
    setLoading(true)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (user) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()
        if (profileData) setProfile(profileData)

        const { data: userBookingData } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('event_id', eventId)
          .eq('user_id', user.id)
          .in('status', ['confirmed', 'waitlist'])
          .maybeSingle()
        setUserBooking(userBookingData || null)

        const { data: alertsData, error: alertsError } = await supabase
          .from('registration_alerts')
          .select('id')
          .eq('user_id', user.id)
          .eq('event_id', eventId)
          .maybeSingle()
        if (alertsError) {
          const missingTable = alertsError.code === '42P01' || alertsError.message?.includes('registration_alerts')
          if (!missingTable) {
            console.warn('Error loading registration alert:', alertsError)
          }
          setAlertSet(false)
        } else {
          setAlertSet(!!alertsData)
        }
      }

      // Load event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError
      setEvent(eventData)

      // Load venue details if present
      if (eventData.venue_id) {
        const { data: venueData, error: venueError } = await supabase
          .from('venues')
          .select('id, name, address, parking_options, accessibility, food_drinks_available')
          .eq('id', eventData.venue_id)
          .single()

        if (!venueError && venueData) {
          setVenue(venueData as VenueDetails)
        }
      }

      // Check if current user is the host
      if (user && eventData.host_user_id === user.id) {
        setIsHost(true)
      }

      // Check if current user is the event creator
      if (user && eventData.created_by === user.id) {
        setIsEventCreator(true)
      }

      // Load host profile if host is assigned
      if (eventData.host_user_id) {
        const { data: hostData, error: hostError } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', eventData.host_user_id)
          .single()

        if (!hostError && hostData) {
          setHostProfile(hostData)
        }
      }

      // Load confirmed bookings
      const { data: confirmedData, error: confirmedError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          waitlist_position,
          profiles (id, full_name, email)
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      if (confirmedError) throw confirmedError
      setConfirmedBookings(confirmedData as any)

      // Load waitlist bookings
      const { data: waitlistData, error: waitlistError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          waitlist_position,
          profiles (id, full_name, email)
        `)
        .eq('event_id', eventId)
        .eq('status', 'waitlist')
        .order('waitlist_position', { ascending: true })

      if (waitlistError) throw waitlistError
      setWaitlistBookings(waitlistData as any)

    } catch (error: any) {
      console.error('Error loading event details:', error)
      alert('Error loading event details')
    } finally {
      setLoading(false)
    }
  }

  async function handleSetAlert() {
    if (!profile) return
    setSettingAlert(true)
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

      setAlertSet(true)
    } catch (error: any) {
      setError(error.message)
    } finally {
      setSettingAlert(false)
    }
  }

  async function handleBookEvent(eventData: EventDetails) {
    if (!profile) return

    setBookingLoading(true)
    setError('')

    try {
      if (eventData.tickets_enabled) {
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

      const effectiveCreditsRequired = eventData.food_coupon_enabled
        ? Math.max(0, Number(eventData.spot_fee_credits || 0)) +
          Math.ceil(Math.max(0, Number(eventData.food_coupon_value_cents || 0)) / 100)
        : eventData.credits_required

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
        body: JSON.stringify({ eventId: eventData.id }),
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
        alert('Event is full. You have been added to the waitlist.')
      } else if (result.voucher) {
        alert(`Event booked successfully! Food coupon issued: ${result.voucher.code}`)
      } else {
        alert('Event booked successfully!')
      }
    } catch (error: any) {
      setError(error.message)
      alert(error.message)
    } finally {
      setBookingLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading event details...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
          <Link href="/dashboard" className="text-blue-600 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const spotsAvailable = event.max_attendees 
    ? event.max_attendees - confirmedBookings.length 
    : null
  const isRegistrationOpen = !event.registration_opens_at || new Date() >= new Date(event.registration_opens_at)
  const isFull = event.max_attendees !== null && confirmedBookings.length >= event.max_attendees
  const isAlreadyBooked =
    !!userBooking && (userBooking.status === 'confirmed' || userBooking.status === 'waitlist')
  const bookingLabel = isFull ? 'Join Waitlist' : 'Book Event'
  const now = new Date()
  const startTime = new Date(event.date)
  const endTime = event.end_time
    ? new Date(event.end_time)
    : new Date(new Date(event.date).getTime() + 2 * 60 * 60 * 1000)
  const isInProgress = startTime <= now && now < endTime

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
        {/* Header */}
        <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <Link 
            href="/dashboard"
            className="text-blue-700 hover:text-blue-900 text-sm mb-2 inline-block font-medium"
            >
            ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Event Details</h1>
        </div>
        </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Info Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl md:text-3xl">{event.title}</CardTitle>
            <Badge variant="outline" className="w-fit text-xs">
              Rating: {event.rating || '18+'}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base md:text-lg text-muted-foreground">{event.description}</p>

            <div className="flex flex-wrap gap-2">
              {event.theme && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                  🎨 Theme: {event.theme}
                </Badge>
              )}
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
                <div className="flex items-center text-sm md:text-base text-gray-900">
                  <span className="mr-2">📅</span>
                  <span>{formatDateTime(event.date)}</span>
                </div>

                <div className="flex items-center text-sm md:text-base text-gray-900">
                  <span className="mr-2">📍</span>
                  {venue ? (
                    <button
                      type="button"
                      onClick={() => setVenueOpen(true)}
                      className="text-blue-700 hover:text-blue-900 underline underline-offset-2"
                    >
                      {venue.name}
                    </button>
                  ) : (
                    <span>{event.location}</span>
                  )}
                </div>

                <div className="flex items-center text-sm md:text-base text-gray-900">
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
                  <div className="flex items-center text-sm md:text-base text-orange-700">
                    <span className="mr-2">⏰</span>
                    <span>Registration opens {formatDateTime(event.registration_opens_at)}</span>
                  </div>
                )}

                {event.max_attendees ? (
                  <div className="flex items-center text-sm md:text-base text-gray-900">
                    <span className="mr-2">👥</span>
                    <span>{confirmedBookings.length} / {event.max_attendees} confirmed
                      {spotsAvailable !== null && spotsAvailable > 0 && (
                        <span className="text-green-600 ml-2">
                          ({spotsAvailable} spot{spotsAvailable !== 1 ? 's' : ''} left)
                        </span>
                      )}
                      {spotsAvailable === 0 && (
                        <span className="text-red-600 ml-2">(FULL)</span>
                      )}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center text-sm md:text-base text-gray-900">
                    <span className="mr-2">👥</span>
                    <span>{confirmedBookings.length} registered (Unlimited)</span>
                  </div>
                )}

                {event.event_type !== 'booked_show' && !event.tickets_enabled && (
                  <div className="flex items-center text-sm md:text-base text-gray-900">
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
                    <Link href={`/events/${eventId}/attendance`}>
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
                ) : (
                  <Button
                    onClick={() => handleBookEvent(event)}
                    disabled={bookingLoading || isAlreadyBooked}
                    size="sm"
                  >
                    {bookingLoading
                      ? 'Booking...'
                      : isAlreadyBooked
                        ? userBooking?.status === 'waitlist'
                          ? 'On Waitlist'
                          : 'Booked'
                        : bookingLabel}
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
        <Card className="mb-6">
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-lg md:text-xl">
              Confirmed Attendees ({confirmedBookings.length})
            </CardTitle>
            <Button variant="outline" size="icon" onClick={copyAttendeeList} aria-label="Copy attendee list">
              <Copy className="h-4 w-4" />
            </Button>
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
                    <Avatar className="w-8 h-8 mr-2 bg-foreground ring-2 ring-muted-foreground/40">
                      <AvatarFallback className="text-background text-xs font-bold bg-foreground">
                        {index + 1}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate hover:text-primary transition-colors">
                        {booking.profiles.full_name}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waitlist */}
        {waitlistBookings.length > 0 && (
          <Card>
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
                    <Avatar className="w-8 h-8 mr-2 bg-foreground ring-2 ring-muted-foreground/40">
                      <AvatarFallback className="text-background text-xs font-bold bg-foreground">
                        {booking.waitlist_position}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs md:text-sm font-medium truncate hover:text-primary transition-colors">
                        {booking.profiles.full_name}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom Navigation */}
      <NavigationTabs />

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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
