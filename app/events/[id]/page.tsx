'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
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
}

type AttendeeBooking = {
  id: string
  status: string
  waitlist_position: number | null
  profiles: {
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
          profiles (full_name, email)
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
          profiles (full_name, email)
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
    <div className="min-h-screen bg-gray-50">
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
        <div className="bg-white rounded-lg shadow-lg p-8 mb-8 border border-gray-200">
            <h2 className="text-3xl font-bold mb-4 text-gray-900">{event.title}</h2>

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

            <div className="grid md:grid-cols-2 gap-6 mb-6">
                <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">DATE & TIME</h3>
                <p className="text-base text-gray-900">📅 {formatDateTime(event.date)}</p>
                </div>

                <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">LOCATION</h3>
                <p className="text-base text-gray-900">📍 {event.location}</p>
                </div>

                <div>
                <h3 className="text-sm font-bold text-gray-700 mb-2">COST</h3>
                <p className="text-base text-gray-900">💳 {event.credits_required} credit{event.credits_required !== 1 ? 's' : ''}</p>
                </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">CAPACITY</h3>
              {event.max_attendees ? (
                <p className="text-lg">
                  👥 {confirmedBookings.length} / {event.max_attendees} confirmed
                  {spotsAvailable !== null && spotsAvailable > 0 && (
                    <span className="text-green-600 ml-2">
                      ({spotsAvailable} spot{spotsAvailable !== 1 ? 's' : ''} left)
                    </span>
                  )}
                  {spotsAvailable === 0 && (
                    <span className="text-red-600 ml-2">(FULL)</span>
                  )}
                </p>
              ) : (
                <p className="text-lg">👥 {confirmedBookings.length} registered (Unlimited)</p>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-500 mb-2">CANCELLATION POLICY</h3>
              <p className="text-lg">⏱️ Cancel up to {event.cancellation_hours}h before for full refund</p>
            </div>

            <div className="mt-6">
              <button
                onClick={copyPublicLink}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-semibold text-sm shadow-md flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            </div>

            {waitlistBookings.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-2">WAITLIST</h3>
                <p className="text-lg">⏳ {waitlistBookings.length} on waitlist</p>
              </div>
            )}
          </div>
        </div>

        {/* Confirmed Attendees */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-xl font-bold mb-4">
            Confirmed Attendees ({confirmedBookings.length})
          </h3>

          {confirmedBookings.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No confirmed attendees yet</p>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {confirmedBookings.map((booking, index) => (
                <div 
                  key={booking.id} 
                  className="flex items-center p-3 bg-green-50 rounded-lg border border-green-200"
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center font-bold mr-3">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {booking.profiles.full_name}
                    </p>
                    {currentUser && (
                      <p className="text-xs text-gray-500 truncate">
                        {booking.profiles.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Waitlist */}
        {waitlistBookings.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-bold mb-4">
              Waitlist ({waitlistBookings.length})
            </h3>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {waitlistBookings.map((booking) => (
                <div 
                  key={booking.id} 
                  className="flex items-center p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                >
                  <div className="flex-shrink-0 w-10 h-10 bg-yellow-500 text-white rounded-full flex items-center justify-center font-bold mr-3">
                    {booking.waitlist_position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {booking.profiles.full_name}
                    </p>
                    {currentUser && (
                      <p className="text-xs text-gray-500 truncate">
                        {booking.profiles.email}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
