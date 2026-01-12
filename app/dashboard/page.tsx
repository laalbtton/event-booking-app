'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event, Booking } from '@/lib/supabase'
import Link from 'next/link'

export default function Dashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [myBookings, setMyBookings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bookingLoading, setBookingLoading] = useState<string | null>(null)
  const [cancellingBooking, setCancellingBooking] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const router = useRouter()

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)

    return () => clearInterval(interval)
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

      // Load user's bookings (confirmed AND waitlist)
      const { data: bookingsData, error: bookingsError } = await supabase
        .from('bookings')
        .select(`
          *,
          events (*)
        `)
        .eq('user_id', userId)
        .in('status', ['confirmed', 'waitlist'])

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
      // Check if already booked (confirmed or waitlist)
      const alreadyBooked = myBookings.some(
        b => b.event_id === event.id && (b.status === 'confirmed' || b.status === 'waitlist')
      )
      if (alreadyBooked) {
        throw new Error('You have already booked this event')
      }

      // Check if user has enough credits
      if (profile.credits < event.credits_required) {
        throw new Error('Insufficient credits')
      }

      // CRITICAL: Check capacity RIGHT BEFORE creating booking
      // This minimizes race condition window
      const { count: confirmedCount, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', event.id)
        .eq('status', 'confirmed')

      if (countError) throw countError

      // Determine booking status based on CURRENT capacity
      let bookingStatus: 'confirmed' | 'waitlist' = 'confirmed'
      
      if (event.max_attendees !== null && confirmedCount !== null) {
        if (confirmedCount >= event.max_attendees) {
          bookingStatus = 'waitlist'
        }
      }

      // Create booking with determined status
      const { data: newBooking, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          user_id: profile.id,
          event_id: event.id,
          credits_used: event.credits_required,
          status: bookingStatus
        })
        .select()
        .single()

      if (bookingError) throw bookingError

      // Update waitlist positions if joining waitlist
      if (bookingStatus === 'waitlist') {
        await supabase.rpc('update_waitlist_positions', { event_uuid: event.id })
      }

      // Deduct credits
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ 
          credits: profile.credits - event.credits_required,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (updateError) {
        // Rollback: delete the booking if credit deduction fails
        await supabase.from('bookings').delete().eq('id', newBooking.id)
        throw updateError
      }

      // Create transaction record
      await supabase.from('credit_transactions').insert({
        user_id: profile.id,
        amount: -event.credits_required,
        transaction_type: 'booking',
        notes: `${bookingStatus === 'waitlist' ? 'Waitlist: ' : ''}Booked event: ${event.title}`
      })

      // Reload data
      await loadData(profile.id)
      
      if (bookingStatus === 'waitlist') {
        alert('Event is full. You have been added to the waitlist. You will be notified if a spot opens up.')
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
    const cancellationWindow = event.cancellation_hours || 4
    
    const willGetRefund = hoursUntilEvent >= cancellationWindow

    // Different messages for confirmed vs waitlist
    let confirmMessage = ''
    if (booking.status === 'waitlist') {
      confirmMessage = `Remove yourself from the waitlist for "${event.title}"?\n\nYou will receive a full refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
    } else {
      confirmMessage = willGetRefund
        ? `Cancel registration for "${event.title}"?\n\nYou will receive a refund of ${booking.credits_used} credit${booking.credits_used > 1 ? 's' : ''}.`
        : `Cancel registration for "${event.title}"?\n\n⚠️ You will NOT receive a refund because cancellation is within ${cancellationWindow} hours of the event.\n\nAre you sure you want to cancel?`
    }

    if (!confirm(confirmMessage)) {
      return
    }

    setCancellingBooking(booking.id)
    setError('')

    try {
      // Update booking status to cancelled
      const { error: bookingError } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', booking.id)

      if (bookingError) throw bookingError

      // Waitlist always gets full refund
      const shouldRefund = booking.status === 'waitlist' || willGetRefund

      if (shouldRefund) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            credits: profile.credits + booking.credits_used,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id)

        if (updateError) throw updateError

        // Log refund transaction
        await supabase.from('credit_transactions').insert({
          user_id: profile.id,
          amount: booking.credits_used,
          transaction_type: 'refund',
          reference_id: booking.id,
          notes: `Refund for cancelled ${booking.status === 'waitlist' ? 'waitlist' : 'event'}: ${event.title}`
        })

        alert(`${booking.status === 'waitlist' ? 'Waitlist removed' : 'Booking cancelled'}. ${booking.credits_used} credit${booking.credits_used > 1 ? 's have' : ' has'} been refunded to your account.`)
      } else {
        // Log cancellation without refund
        await supabase.from('credit_transactions').insert({
          user_id: profile.id,
          amount: 0,
          transaction_type: 'cancellation_no_refund',
          reference_id: booking.id,
          notes: `Cancelled event without refund (within ${cancellationWindow}h window): ${event.title}`
        })

        alert('Booking cancelled. No refund issued as cancellation was within the event window.')
      }

      // Update waitlist positions if this was a confirmed booking
      if (booking.status === 'confirmed') {
        await supabase.rpc('update_waitlist_positions', { event_uuid: event.id })
      }

      // Reload data
      await loadData(profile.id)

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
              {myBookings.map((booking) => {
                const eventDate = new Date(booking.events.date)
                const now = currentTime
                const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60)
                const cancellationWindow = booking.events.cancellation_hours || 4
                const canCancel = hoursUntilEvent >= 0
                const willGetRefund = hoursUntilEvent >= cancellationWindow

                // Calculate time display
                const diffMs = eventDate.getTime() - now.getTime()
                const isPast = diffMs < 0
                
                let timeDisplay = ''
                if (!isPast) {
                  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

                  let parts = []
                  if (days > 0) parts.push(`${days}d`)
                  if (hours > 0 || days > 0) parts.push(`${hours}h`)
                  if (days === 0) parts.push(`${minutes}m`)
                  
                  timeDisplay = parts.join(' ') || '0m'
                }

                const isWaitlist = booking.status === 'waitlist'
                const borderColor = isWaitlist ? 'border-yellow-500' : 'border-green-500'

                return (
                  <div key={booking.id} className={`bg-white rounded-lg shadow p-6 border-l-4 ${borderColor}`}>
                    <h3 className="font-bold text-lg mb-2">
                        <Link 
                          href={`/events/${booking.event_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {booking.events.title}
                        </Link>
                    </h3>
                    <p className="text-gray-600 text-sm mb-2">{booking.events.description}</p>
                    <div className="text-sm text-gray-500 mb-4">
                      <p>📅 {new Date(booking.events.date).toLocaleString()}</p>
                      <p>📍 {booking.events.location}</p>
                      <p>💳 {booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</p>
                      
                      {!isPast ? (
                        <p className="text-blue-600 font-semibold mt-2">
                          ⏰ In {timeDisplay}
                        </p>
                      ) : (
                        <p className="text-gray-400 font-semibold mt-2">
                          ✓ Event completed
                        </p>
                      )}
                      
                      {!isPast && (
                        isWaitlist ? (
                          <p className="text-yellow-600 font-semibold">
                            ⏳ Waitlist #{booking.waitlist_position}
                          </p>
                        ) : (
                          <p className="text-green-600 font-semibold">✓ Confirmed</p>
                        )
                      )}
                    </div>

                    {canCancel && (
                      <>
                        <button
                          onClick={() => handleCancelBooking(booking)}
                          disabled={cancellingBooking === booking.id}
                          className="w-full bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-400 text-sm font-medium"
                        >
                          {cancellingBooking === booking.id 
                            ? 'Cancelling...' 
                            : isWaitlist 
                              ? 'Leave Waitlist' 
                              : 'Cancel Booking'
                          }
                        </button>

                        <p className="text-xs text-gray-500 mt-2 text-center">
                          {isWaitlist
                            ? `✓ Full refund if you leave waitlist`
                            : willGetRefund 
                              ? `✓ Full refund available (${timeDisplay} until event)`
                              : `⚠️ No refund (within ${cancellationWindow}h window) (${timeDisplay} until event)`
                          }
                        </p>
                      </>
                    )}
                  </div>
                )
              })}
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
                const booking = myBookings.find(b => b.event_id === event.id)
                const isBooked = !!booking
                const canAfford = (profile?.credits || 0) >= event.credits_required
                const isBooking = bookingLoading === event.id

                return (
                  <div key={event.id} className="bg-white rounded-lg shadow p-6">
                    <h3 className="font-bold text-lg mb-2">
                      <Link 
                        href={`/events/${event.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {event.title}
                      </Link>
                    </h3>
                    <p className="text-gray-600 text-sm mb-4">{event.description}</p>
                    
                    <div className="text-sm text-gray-500 mb-4">
                      <p>📅 {new Date(event.date).toLocaleString()}</p>
                      <p>📍 {event.location}</p>
                      {event.max_attendees && (
                        <p>👥 Max {event.max_attendees} attendees</p>
                      )}
                      <p className="text-xs mt-2">
                        ⏱️ Cancel up to {event.cancellation_hours || 4}h before for refund
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-lg font-semibold text-blue-600">
                        {event.credits_required} {event.credits_required === 1 ? 'credit' : 'credits'}
                      </span>
                      
                      {isBooked ? (
                        booking.status === 'waitlist' ? (
                          <span className="text-yellow-600 font-semibold">⏳ Waitlisted</span>
                        ) : (
                          <span className="text-green-600 font-semibold">✓ Booked</span>
                        )
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