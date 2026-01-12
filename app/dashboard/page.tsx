'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event, Booking } from '@/lib/supabase'

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      router.push('/login')
      return
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

      // Load upcoming events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString())
        .order('date', { ascending: true })

      if (eventsError) throw eventsError
      setEvents(eventsData || [])

      // Load user's bookings
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          events (*)
        `)
        .eq('user_id', userId)
        .eq('status', 'confirmed')

      if (bookingsError) throw bookingsError
      setMyBookings(bookingsData || [])

    } catch (error: any) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleBookEvent(event: Event) {
    if (!profile) return

    setBookingLoading(event.id)
    setError('')

    try {
      // Check if already booked
      const alreadyBooked = myBookings.some(b => b.event_id === event.id)
      if (alreadyBooked) {
        throw new Error('You have already booked this event')
      }

      // Check if user has enough credits
      if (profile.credits < event.credits_required) {
        throw new Error('Insufficient credits')
      }

      // Create booking
      const { error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: profile.id,
          event_id: event.id,
          credits_used: event.credits_required,
          status: 'confirmed'
        })

      if (bookingError) throw bookingError

      // Deduct credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          credits: profile.credits - event.credits_required,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) throw updateError

      // Create transaction record
      await supabase.from('credit_transactions').insert({
        user_id: profile.id,
        amount: -event.credits_required,
        transaction_type: 'booking',
        notes: `Booked event: ${event.title}`
      })

      // Reload data
      await loadData(profile.id)
      alert('Event booked successfully!')

    } catch (error: any) {
      setError(error.message)
      alert(error.message)
    } finally {
      setBookingLoading(null)
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Credits Card */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-lg font-semibold mb-2">Welcome, {profile?.full_name}!</h2>
          <div className="flex items-baseline">
            <span className="text-5xl font-bold">{profile?.credits || 0}</span>
            <span className="text-xl ml-2">credits available</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* My Bookings Section */}
        {myBookings.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4">My Bookings</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myBookings.map((booking) => (
                <div key={booking.id} className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
                  <h3 className="font-bold text-lg mb-2">{booking.events.title}</h3>
                  <p className="text-gray-600 text-sm mb-2">{booking.events.description}</p>
                  <div className="text-sm text-gray-500">
                    <p>📅 {new Date(booking.events.date).toLocaleDateString()}</p>
                    <p>📍 {booking.events.location}</p>
                    <p className="text-green-600 font-semibold mt-2">✓ Confirmed</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Events Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Available Events</h2>
          
          {events.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No upcoming events available
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => {
                const isBooked = myBookings.some(b => b.event_id === event.id)
                const canAfford = (profile?.credits || 0) >= event.credits_required
                const isBooking = bookingLoading === event.id

                return (
                  <div key={event.id} className="bg-white rounded-lg shadow p-6">
                    <h3 className="font-bold text-lg mb-2">{event.title}</h3>
                    <p className="text-gray-600 text-sm mb-4">{event.description}</p>
                    
                    <div className="text-sm text-gray-500 mb-4">
                      <p>📅 {new Date(event.date).toLocaleDateString()}</p>
                      <p>📍 {event.location}</p>
                      {event.max_attendees && (
                        <p>👥 Max {event.max_attendees} attendees</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-blue-600">
                        {event.credits_required} {event.credits_required === 1 ? 'credit' : 'credits'}
                      </span>
                      
                      {isBooked ? (
                        <span className="text-green-600 font-semibold">✓ Booked</span>
                      ) : (
                        <button
                          onClick={() => handleBookEvent(event)}
                          disabled={!canAfford || isBooking}
                          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                        >
                          {isBooking ? 'Booking...' : !canAfford ? 'Not enough credits' : 'Book Event'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}