'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

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
  host_profile?: {
    full_name: string
  } | null
}

type AttendeeBooking = {
  id: string
  status: string
  waitlist_position: number | null
  profiles: {
    id: string
    full_name: string
  }
}

export default function PublicEventPage() {
  const params = useParams()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [confirmedBookings, setConfirmedBookings] = useState<AttendeeBooking[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<AttendeeBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [hostProfile, setHostProfile] = useState<{ full_name: string } | null>(null)

  useEffect(() => {
    loadEventDetails()
  }, [eventId])

  async function loadEventDetails() {
    setLoading(true)

    try {
      // Load event details (public - no auth required)
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError
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
          waitlist_position,
          profiles (id, full_name)
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      if (confirmedError) throw confirmedError
      setConfirmedBookings(confirmedData as any)

      // Load waitlist bookings (public - no auth required)
      const { data: waitlistData, error: waitlistError } = await supabase
        .from('bookings')
        .select(`
          id,
          status,
          waitlist_position,
          profiles (id, full_name)
        `)
        .eq('event_id', eventId)
        .eq('status', 'waitlist')
        .order('waitlist_position', { ascending: true })

      if (waitlistError) throw waitlistError
      setWaitlistBookings(waitlistData as any)

    } catch (error: any) {
      console.error('Error loading event details:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl text-gray-900">Loading event...</div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
        <div className="text-center bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-gray-900">Event Not Found</h1>
          <p className="text-gray-600 mb-6">This event doesn't exist or has been removed.</p>
          <Link 
            href="/signup" 
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold inline-block"
          >
            Sign Up to Browse Events
          </Link>
        </div>
      </div>
    )
  }

  const spotsAvailable = event.max_attendees 
    ? event.max_attendees - confirmedBookings.length 
    : null

  const eventDate = new Date(event.date)
  const isPastEvent = eventDate < new Date()

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-md border-b-4 border-blue-600">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Event Lineup</h1>
          <p className="text-gray-600 mt-1">Public event information</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Info Card */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-8 border-t-4 border-blue-600">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">{event.title}</h2>
            {isPastEvent && (
              <span className="bg-gray-200 text-gray-700 px-3 py-1 rounded-full text-sm font-semibold">
                Past Event
              </span>
            )}
          </div>
          
          <p className="text-gray-700 text-lg mb-6">{event.description}</p>

          {event.theme && (
            <div className="mb-4">
              <span className="inline-block bg-purple-100 text-purple-700 px-4 py-2 rounded-lg font-semibold">
                🎨 Theme: {event.theme}
              </span>
            </div>
          )}

          {hostProfile && (
            <div className="mb-4">
              <span className="inline-block bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg font-semibold">
                👤 Host: {hostProfile.full_name}
              </span>
            </div>
          )}

          {event.host_user_id && !hostProfile && (
            <div className="mb-4">
              <span className="inline-block bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold">
                👤 Host: TBD
              </span>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <h3 className="text-sm font-bold text-blue-900 mb-2">📅 DATE & TIME</h3>
              <p className="text-base text-gray-900">{eventDate.toLocaleString()}</p>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <h3 className="text-sm font-bold text-purple-900 mb-2">📍 LOCATION</h3>
              <p className="text-base text-gray-900">{event.location}</p>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <h3 className="text-sm font-bold text-green-900 mb-2">👥 CAPACITY</h3>
              {event.max_attendees ? (
                <p className="text-base text-gray-900">
                  {confirmedBookings.length} / {event.max_attendees} registered
                  {spotsAvailable !== null && spotsAvailable > 0 && (
                    <span className="text-green-700 block text-sm mt-1">
                      ({spotsAvailable} spot{spotsAvailable !== 1 ? 's' : ''} available)
                    </span>
                  )}
                  {spotsAvailable === 0 && (
                    <span className="text-red-700 block text-sm mt-1 font-semibold">(FULL)</span>
                  )}
                </p>
              ) : (
                <p className="text-base text-gray-900">{confirmedBookings.length} registered</p>
              )}
            </div>

            {waitlistBookings.length > 0 && (
              <div className="bg-yellow-50 p-4 rounded-lg">
                <h3 className="text-sm font-bold text-yellow-900 mb-2">⏳ WAITLIST</h3>
                <p className="text-base text-gray-900">{waitlistBookings.length} on waitlist</p>
              </div>
            )}
          </div>
        </div>

        {/* Confirmed Attendees */}
        <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              Confirmed Attendees ({confirmedBookings.length})
            </h3>
          </div>

          {confirmedBookings.length === 0 ? (
            <p className="text-gray-500 text-center py-12 text-lg">No confirmed attendees yet</p>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {confirmedBookings.map((booking, index) => (
                <Link
                  key={booking.id}
                  href={`/profile/${booking.profiles.id}`}
                  className="flex items-center p-4 bg-green-50 rounded-lg border-2 border-green-200 hover:border-green-400 transition-colors cursor-pointer"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-green-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-3 shadow-md">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900 truncate hover:text-blue-600">
                      {booking.profiles.full_name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Waitlist */}
        {waitlistBookings.length > 0 && (
          <div className="bg-white rounded-lg shadow-lg p-6 md:p-8 mb-6">
            <h3 className="text-2xl font-bold mb-6 text-gray-900">
              Waitlist ({waitlistBookings.length})
            </h3>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {waitlistBookings.map((booking) => (
                <Link
                  key={booking.id}
                  href={`/profile/${booking.profiles.id}`}
                  className="flex items-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200 hover:border-yellow-400 transition-colors cursor-pointer"
                >
                  <div className="flex-shrink-0 w-12 h-12 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold text-lg mr-3 shadow-md">
                    {booking.waitlist_position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-gray-900 truncate hover:text-blue-600">
                      {booking.profiles.full_name}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Call to Action */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-lg shadow-lg p-8 text-center text-white">
          <h3 className="text-2xl font-bold mb-3">Want to Join?</h3>
          <p className="text-lg mb-6">Sign up to book events and manage your registrations</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link 
              href="/signup"
              className="bg-white text-blue-700 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 inline-block text-lg shadow-lg"
            >
              Sign Up
            </Link>
            <Link 
              href="/login"
              className="bg-transparent border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white hover:text-blue-700 inline-block text-lg"
            >
              Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}