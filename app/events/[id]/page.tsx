'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'



type EventDetails = {
  id: string
  title: string
  description: string
  theme: string | null
  date: string
  location: string
  credits_required: number
  max_attendees: number | null
  cancellation_hours: number
  host_user_id: string | null
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
  const [hostProfile, setHostProfile] = useState<{ full_name: string } | null>(null)
  const [isHost, setIsHost] = useState(false)
  const [isEventCreator, setIsEventCreator] = useState(false)


  function copyPublicLink() {
  const publicUrl = `${window.location.origin}/event-public/${eventId}`
  navigator.clipboard.writeText(publicUrl)
  alert('Public link copied to clipboard!')
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

      // Load event details
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError
      setEvent(eventData)

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
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-base md:text-lg text-muted-foreground">{event.description}</p>

            <div className="flex flex-wrap gap-2">
              {event.theme && (
                <Badge variant="secondary" className="bg-purple-100 text-purple-700 hover:bg-purple-100">
                  🎨 Theme: {event.theme}
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
                  <span>{event.location}</span>
                </div>

                <div className="flex items-center text-sm md:text-base text-gray-900">
                  <span className="mr-2">💳</span>
                  <span><strong className="font-semibold">Cost:</strong> {event.credits_required} credit{event.credits_required !== 1 ? 's' : ''}</span>
                </div>

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

                <div className="flex items-center text-sm md:text-base text-gray-900">
                  <span className="mr-2">⏱️</span>
                  <span>Cancel up to {event.cancellation_hours}h before for full refund</span>
                </div>
            </div>

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

            {waitlistBookings.length > 0 && (
              <p className="text-sm md:text-base text-muted-foreground">⏳ {waitlistBookings.length} on waitlist</p>
            )}
          </CardContent>
        </Card>

        {/* Confirmed Attendees */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg md:text-xl">
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
                    className="flex items-center p-2 bg-green-50 rounded-lg border border-green-200 hover:border-green-400 hover:bg-green-100 transition-all cursor-pointer"
                  >
                    <Avatar className="w-8 h-8 mr-2 bg-green-500">
                      <AvatarFallback className="text-white text-xs font-bold">
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
                    className="flex items-center p-2 bg-yellow-50 rounded-lg border border-yellow-200 hover:border-yellow-400 hover:bg-yellow-100 transition-all cursor-pointer"
                  >
                    <Avatar className="w-8 h-8 mr-2 bg-yellow-500">
                      <AvatarFallback className="text-white text-xs font-bold">
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
    </div>
  )
}
