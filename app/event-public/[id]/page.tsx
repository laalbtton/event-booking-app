'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

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
  registration_opens_at: string | null
  date: string
  end_time: string | null
  location: string
  credits_required: number
  food_coupon_enabled?: boolean
  spot_fee_credits?: number
  food_coupon_value_cents?: number
  max_attendees: number | null
  cancellation_hours: number
  host_user_id: string | null
  host_profile?: {
    full_name: string
  } | null
  audience_expected_count?: number
}

type AttendeeBooking = {
  id: string
  status: string
  waitlist_position: number | null
  event_art_type_id?: string | null
  profiles: {
    id: string
    full_name: string
  }
}

type VarietyArtOption = {
  id: string
  name: string
  capacity: number
  confirmedCount: number
}

export default function PublicEventPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [confirmedBookings, setConfirmedBookings] = useState<AttendeeBooking[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<AttendeeBooking[]>([])
  const [audienceExpectedCount, setAudienceExpectedCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isUnavailable, setIsUnavailable] = useState(false)
  const [hostProfile, setHostProfile] = useState<{ full_name: string } | null>(null)
  const [varietyOptions, setVarietyOptions] = useState<VarietyArtOption[]>([])

  function getBookingArtTypeLabel(booking: AttendeeBooking): string | null {
    if (!event || event.event_type !== 'open_mic' || (event as any).open_mic_type !== 'variety_arts_open_mic') return null
    if (!booking.event_art_type_id) return null
    const match = varietyOptions.find((option) => option.id === booking.event_art_type_id)
    return match?.name || null
  }

  useEffect(() => {
    loadEventDetails()
  }, [eventId])

  async function loadEventDetails() {
    setLoading(true)
    setIsUnavailable(false)

    try {
      // Load event details (public - no auth required)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError

      if (eventData?.status === 'cancelled') {
        setIsUnavailable(true)
        setEvent(null)
        return
      }

      setEvent(eventData)

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

      // Load confirmed bookings (public - no auth required)
      const { data: confirmedData, error: confirmedError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          booking_scope,
          event_art_type_id,
          waitlist_position,
          profiles (id, full_name)
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      if (confirmedError) throw confirmedError
      const performerConfirmed = (confirmedData || []).filter((booking: any) => booking.booking_scope !== 'audience')
      setConfirmedBookings(performerConfirmed as any)

      // Load waitlist bookings (public - no auth required)
      const { data: waitlistData, error: waitlistError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          booking_scope,
          event_art_type_id,
          waitlist_position,
          profiles (id, full_name)
        `)
        .eq('event_id', eventId)
        .eq('status', 'waitlist')
        .order('waitlist_position', { ascending: true })

      if (waitlistError) throw waitlistError
      const performerWaitlist = (waitlistData || []).filter((booking: any) => booking.booking_scope !== 'audience')
      setWaitlistBookings(performerWaitlist as any)

      if (
        eventData.event_type === 'open_mic' &&
        (eventData as any).open_mic_type === 'variety_arts_open_mic'
      ) {
        const { data: artRows } = await supabase
          .from('event_art_types')
          .select('id, art_type_name, slot_capacity')
          .eq('event_id', eventId)
          .order('created_at', { ascending: true })

        setVarietyOptions(
          (artRows || []).map((row: any) => ({
            id: row.id,
            name: row.art_type_name,
            capacity: Number(row.slot_capacity || 0),
            confirmedCount: (confirmedData || []).filter(
              (booking: any) => booking.booking_scope !== 'audience' && booking.event_art_type_id === row.id
            ).length,
          }))
        )
      } else {
        setVarietyOptions([])
      }

      const { count: audienceCount } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('booking_scope', 'audience')
        .in('status', ['confirmed', 'waitlist'])
      setAudienceExpectedCount(audienceCount || 0)

    } catch (error: any) {
      console.error('Error loading event details:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isUnavailable) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Event Cancelled</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">
              This event has been cancelled and is no longer available.
            </p>
            <Button asChild className="w-full">
              <Link href="/signup">Sign Up to Browse Events</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-center">Event Not Found</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-muted-foreground">This event doesn't exist or has been removed.</p>
            <Button asChild className="w-full">
              <Link href="/signup">Sign Up to Browse Events</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const spotsAvailable = event.max_attendees 
    ? event.max_attendees - confirmedBookings.length 
    : null
  const useGlobalVarietyCapacity =
    event.event_type === 'open_mic' &&
    (event as any).open_mic_type === 'variety_arts_open_mic' &&
    !!(event as any).variety_use_max_attendees

  const eventDate = new Date(event.date)
  const now = new Date()
  const endTime = event.end_time
    ? new Date(event.end_time)
    : new Date(new Date(event.date).getTime() + 2 * 60 * 60 * 1000)
  const isPastEvent = eventDate < now
  const isInProgress = eventDate <= now && now < endTime
  const languages = Array.isArray((event as any).languages) && (event as any).languages.length > 0
    ? (event as any).languages
    : ['English']
  const languageSummary = ((event as any).is_multilingual || languages.length > 1)
    ? `Multilingual: ${languages.join(', ')}`
    : (languages[0] || 'English')
  const ratingLabel = String(event.rating || '18+').trim()
  const ratingDisplay = `${ratingLabel.toLowerCase().includes('all') ? '👨‍👩‍👧‍👦' : '🔞'} ${ratingLabel}`

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-background border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight">Event Lineup</h1>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        {/* Event Info Card */}
        <Card className="mb-6 shadow-lg border-t-4 border-t-primary">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">{event.title}</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {ratingDisplay}
                </Badge>
                {isInProgress && (
                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                    In Progress
                  </Badge>
                )}
                {isPastEvent && (
                  <Badge variant="secondary">Past Event</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed">{event.description}</p>

            <div className="flex flex-wrap gap-2">
              {event.theme && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                  🎨 Theme: {event.theme}
                </Badge>
              )}
              <Badge variant="outline">🗣️ {languageSummary}</Badge>

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

            <div className="space-y-2.5 pt-2">
              <div className="flex items-center text-sm md:text-base">
                <span className="mr-2">📅</span>
                <span>{formatDateTime(event.date)}</span>
              </div>

              <div className="flex items-center text-sm md:text-base">
                <span className="mr-2">📍</span>
                <span>{event.location}</span>
              </div>

              <div className="flex items-center text-sm md:text-base">
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

              {event.registration_opens_at && new Date() < new Date(event.registration_opens_at) && (
                <div className="flex items-center gap-2 text-sm md:text-base text-orange-700">
                  <span className="mr-2">⏰</span>
                  <span>Registration opens {formatDateTime(event.registration_opens_at)}</span>
                  <Badge variant="outline" className="text-orange-600 border-orange-600">
                    Not Open
                  </Badge>
                </div>
              )}

              {event.max_attendees ? (
                <div className="flex items-center text-sm md:text-base">
                  <span className="mr-2">👥</span>
                  <span>{confirmedBookings.length} / {event.max_attendees} registered
                    {spotsAvailable !== null && spotsAvailable > 0 && (
                      <Badge variant="outline" className="ml-2 text-green-600 border-green-600">
                        {spotsAvailable} spot{spotsAvailable !== 1 ? 's' : ''} available
                      </Badge>
                    )}
                    {spotsAvailable === 0 && (
                      <Badge variant="destructive" className="ml-2">
                        FULL
                      </Badge>
                    )}
                  </span>
                </div>
              ) : (
                <div className="flex items-center text-sm md:text-base">
                  <span className="mr-2">👥</span>
                  <span>{confirmedBookings.length} registered</span>
                </div>
              )}

              {event.event_type === 'open_mic' && (event as any).open_mic_type === 'variety_arts_open_mic' && varietyOptions.length > 0 && (
                <div className="flex items-center text-sm md:text-base">
                  <span className="mr-2">🎭</span>
                  <span>
                    {useGlobalVarietyCapacity
                      ? varietyOptions.map((option) => option.name).join(' · ')
                      : varietyOptions.map((option) => `${option.name}: ${Math.max(0, option.capacity - option.confirmedCount)} left`).join(' · ')}
                  </span>
                </div>
              )}

              {audienceExpectedCount >= 5 && (
                <div className="flex items-center text-sm md:text-base">
                  <span className="mr-2">🧑‍🤝‍🧑</span>
                  <span>Expected audience: {audienceExpectedCount}</span>
                </div>
              )}

              {waitlistBookings.length > 0 && (
                <div className="flex items-center text-sm md:text-base">
                  <span className="mr-2">⏳</span>
                  <span>{waitlistBookings.length} on waitlist</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmed Attendees */}
        <Card className="mb-6 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl font-bold tracking-tight">
              Confirmed Attendees ({confirmedBookings.length})
            </CardTitle>
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
                      {getBookingArtTypeLabel(booking) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getBookingArtTypeLabel(booking)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Waitlist */}
        {waitlistBookings.length > 0 && (
          <Card className="mb-6 shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg sm:text-xl font-bold tracking-tight">
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
                      {getBookingArtTypeLabel(booking) && (
                        <p className="text-[11px] text-muted-foreground truncate">
                          {getBookingArtTypeLabel(booking)}
                        </p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Call to Action */}
        <Card className="bg-gradient-to-r from-blue-600 to-purple-700 border-0 text-white shadow-lg">
          <CardContent className="p-8 text-center">
            {event.event_type === 'booked_show' && (
              <p className="text-sm font-semibold text-white/90 mb-2">Invite only</p>
            )}
            {event.tickets_enabled && event.external_event && event.external_ticket_url && (
              <div className="mb-3">
                <Button asChild size="lg" variant="secondary" className="bg-white text-blue-700 hover:bg-gray-100">
                  <a href={event.external_ticket_url} target="_blank" rel="noreferrer">
                    Buy Tickets
                  </a>
                </Button>
              </div>
            )}
            <h3 className="text-xl sm:text-2xl font-bold mb-3">Want to Join?</h3>
            <p className="text-base sm:text-lg mb-6 text-white/90">Sign up to book events and manage your registrations</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg" variant="secondary" className="bg-white text-blue-700 hover:bg-gray-100">
                <Link href="/signup">Sign Up</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-2 border-white text-white hover:bg-white hover:text-blue-700">
                <Link href="/login">Login</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}