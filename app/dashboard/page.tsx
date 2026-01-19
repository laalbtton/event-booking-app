'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Profile, Event, Booking } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [roleRequestStatus, setRoleRequestStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const [eventConfirmedCounts, setEventConfirmedCounts] = useState<Record<string, number>>({})
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

      // Load upcoming events
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .gte('date', new Date().toISOString())
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

      // Create transaction record (non-blocking - if it fails, booking still succeeds)
      try {
        await supabase.from('credit_transactions').insert({
          user_id: profile.id,
          amount: -event.credits_required,
          transaction_type: 'booking',
          notes: `${bookingStatus === 'waitlist' ? 'Waitlist: ' : ''}Booked event: ${event.title}`
        })
      } catch (transactionError: any) {
        // Log error but don't fail the booking
        console.warn('Failed to log credit transaction:', transactionError)
      }

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

      // If a confirmed booking was cancelled and event has max_attendees, promote next waitlist member
      if (booking.status === 'confirmed' && event.max_attendees) {
        // Get current confirmed count (after cancellation, this should be one less)
        const { count: currentConfirmedCount, error: countError } = await supabase
          .from('bookings')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id)
          .eq('status', 'confirmed')

        if (countError) {
          console.error('Error getting confirmed count:', countError)
        } else {
          console.log(`Event ${event.id}: Current confirmed count: ${currentConfirmedCount}, Max: ${event.max_attendees}`)
          
          if (currentConfirmedCount !== null && currentConfirmedCount < event.max_attendees) {
            // Find the next waitlist member (lowest waitlist_position)
            const { data: nextWaitlistMember, error: waitlistError } = await supabase
              .from('bookings')
              .select('id, user_id, credits_used, waitlist_position')
              .eq('event_id', event.id)
              .eq('status', 'waitlist')
              .order('waitlist_position', { ascending: true })
              .limit(1)
              .maybeSingle()

            if (waitlistError) {
              console.error('Error finding waitlist member:', waitlistError)
            } else if (nextWaitlistMember) {
              console.log(`Promoting waitlist member ${nextWaitlistMember.id} (position ${nextWaitlistMember.waitlist_position}) to confirmed`)
              
              // Promote the waitlist member to confirmed
              const { error: promoteError } = await supabase
                .from('bookings')
                .update({ 
                  status: 'confirmed',
                  waitlist_position: null
                })
                .eq('id', nextWaitlistMember.id)

              if (promoteError) {
                console.error('Error promoting waitlist member:', promoteError)
              } else {
                console.log(`Successfully promoted waitlist member ${nextWaitlistMember.id} to confirmed`)
                
                // Small delay to ensure the promotion is committed
                await new Promise(resolve => setTimeout(resolve, 100))
                
                // Update waitlist positions for remaining waitlist members
                // First, get all remaining waitlist members (refresh after promotion)
                const { data: remainingWaitlist, error: remainingError } = await supabase
                  .from('bookings')
                  .select('id, waitlist_position')
                  .eq('event_id', event.id)
                  .eq('status', 'waitlist')
                  .order('waitlist_position', { ascending: true })

                if (!remainingError && remainingWaitlist && remainingWaitlist.length > 0) {
                  console.log(`Found ${remainingWaitlist.length} remaining waitlist members to update`)
                  
                  // Update positions sequentially (1, 2, 3, etc.)
                  let successCount = 0
                  for (let i = 0; i < remainingWaitlist.length; i++) {
                    const newPosition = i + 1
                    const oldPosition = remainingWaitlist[i].waitlist_position
                    
                    console.log(`Updating booking ${remainingWaitlist[i].id} from position ${oldPosition} to ${newPosition}`)
                    
                    const { data: updatedData, error: updateError } = await supabase
                      .from('bookings')
                      .update({ waitlist_position: newPosition })
                      .eq('id', remainingWaitlist[i].id)
                      .select()

                    if (updateError) {
                      console.error(`Error updating waitlist position for ${remainingWaitlist[i].id}:`, updateError)
                    } else if (updatedData && updatedData.length > 0) {
                      console.log(`✓ Successfully updated booking ${remainingWaitlist[i].id} to position ${newPosition}`)
                      successCount++
                    } else {
                      console.warn(`⚠ No rows updated for booking ${remainingWaitlist[i].id}`)
                    }
                  }
                  console.log(`Successfully updated ${successCount}/${remainingWaitlist.length} waitlist positions`)
                  
                  // Verify the updates by fetching the waitlist again
                  const { data: verifyWaitlist, error: verifyError } = await supabase
                    .from('bookings')
                    .select('id, waitlist_position')
                    .eq('event_id', event.id)
                    .eq('status', 'waitlist')
                    .order('waitlist_position', { ascending: true })
                  
                  if (!verifyError && verifyWaitlist) {
                    console.log('Verification - Current waitlist positions:', verifyWaitlist.map(w => ({ id: w.id, position: w.waitlist_position })))
                  } else if (verifyError) {
                    console.error('Error verifying waitlist positions:', verifyError)
                  }
                } else if (remainingError) {
                  console.error('Error fetching remaining waitlist:', remainingError)
                } else {
                  console.log('No remaining waitlist members to update')
                }
              }
            } else {
              console.log('No waitlist members found to promote')
            }
          } else {
            console.log(`Event is still at capacity (${currentConfirmedCount}/${event.max_attendees}), no promotion needed`)
          }
        }
      }

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

        // Log refund transaction (non-blocking)
        try {
          await supabase.from('credit_transactions').insert({
            user_id: profile.id,
            amount: booking.credits_used,
            transaction_type: 'refund',
            reference_id: booking.id,
            notes: `Refund for cancelled ${booking.status === 'waitlist' ? 'waitlist' : 'event'}: ${event.title}`
          })
        } catch (transactionError: any) {
          // Log error but don't fail the refund
          console.warn('Failed to log refund transaction:', transactionError)
        }

        alert(`${booking.status === 'waitlist' ? 'Waitlist removed' : 'Booking cancelled'}. ${booking.credits_used} credit${booking.credits_used > 1 ? 's have' : ' has'} been refunded to your account.`)
      } else {
        // Log cancellation without refund (non-blocking)
        try {
          await supabase.from('credit_transactions').insert({
            user_id: profile.id,
            amount: 0,
            transaction_type: 'cancellation_no_refund',
            reference_id: booking.id,
            notes: `Cancelled event without refund (within ${cancellationWindow}h window): ${event.title}`
          })
        } catch (transactionError: any) {
          // Log error but don't fail the cancellation
          console.warn('Failed to log cancellation transaction:', transactionError)
        }

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
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Role Request Status / Apply Section */}
        {userRole === 'performer' && (
          <div className="mb-6">
            {roleRequestStatus === 'pending' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-yellow-900">Application Pending</h3>
                  <p className="text-sm text-yellow-700">Your request to become an Event Creator is under review.</p>
                </div>
                <Link
                  href="/apply-event-creator"
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 font-medium"
                >
                  View Status
                </Link>
              </div>
            )}
            {roleRequestStatus === 'rejected' && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-red-900">Application Rejected</h3>
                  <p className="text-sm text-red-700">Your previous request was rejected. You can submit a new application.</p>
                </div>
                <Link
                  href="/apply-event-creator"
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium"
                >
                  Reapply
                </Link>
              </div>
            )}
            {!roleRequestStatus && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900">Become an Event Creator</h3>
                  <p className="text-sm text-blue-700">Create and manage your own events! Apply now.</p>
                </div>
                <Link
                  href="/apply-event-creator"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
                >
                  Apply Now
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Credits Card */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-700 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-lg font-semibold mb-2">Welcome, {profile?.full_name}!</h2>
          <div className="flex items-baseline">
            <span className="text-5xl font-bold drop-shadow-md">{profile?.credits || 0}</span>
            <span className="text-xl ml-2 drop-shadow">credits available</span>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* My Bookings Section - Upcoming Only */}
        {myBookings.filter((booking) => new Date(booking.events.date) >= currentTime).length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">My Bookings</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myBookings
                .filter((booking) => new Date(booking.events.date) >= currentTime)
                .map((booking) => {
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
                  <div key={booking.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${borderColor}`}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg flex-1">
                        <Link 
                          href={`/events/${booking.event_id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {booking.events.title}
                        </Link>
                      </h3>
                      {!isPast && (
                        isWaitlist ? (
                          <span className="text-yellow-600 font-semibold text-xs ml-2 whitespace-nowrap">
                            ⏳ #{booking.waitlist_position}
                          </span>
                        ) : (
                          <span className="text-green-600 font-semibold text-xs ml-2">✓</span>
                        )
                      )}
                    </div>
                    
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{booking.events.description}</p>
                    
                    <div className="flex justify-between gap-4 text-xs text-gray-600 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-1">
                          <span>📅</span>
                          <span>{formatDateTime(booking.events.date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>📍</span>
                          <span>{booking.events.location}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        {booking.events.max_attendees && (
                          <div className="mb-1">
                            <span>👥 Max {booking.events.max_attendees}</span>
                          </div>
                        )}
                        {booking.events.theme && (
                          <div>
                            <span>🎨 {booking.events.theme}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs mb-3">
                      <div className="flex items-center gap-1">
                        <span>💳</span>
                        <span>{booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                      </div>
                      {!isPast ? (
                        <div className="flex items-center gap-1 text-blue-600 font-semibold">
                          <span>⏰</span>
                          <span>In {timeDisplay}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-gray-400">
                          <span>✓</span>
                          <span>Completed</span>
                        </div>
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
          <h2 className="text-2xl font-bold mb-4 text-gray-900">Available Events</h2>
          
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
                
                // Check if registration is open
                const isRegistrationOpen = !event.registration_opens_at || new Date() >= new Date(event.registration_opens_at)
                const registrationOpensAt = event.registration_opens_at ? new Date(event.registration_opens_at) : null
                
                // Check if event is full
                const confirmedCount = eventConfirmedCounts[event.id] || 0
                const isFull = event.max_attendees !== null && confirmedCount >= event.max_attendees

                return (
                  <div key={event.id} className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-lg flex-1 text-gray-900">
                        <Link 
                          href={`/events/${event.id}`}
                          className="text-blue-700 hover:text-blue-900 hover:underline"
                        >
                          {event.title}
                        </Link>
                      </h3>
                      <span className="text-lg font-semibold text-blue-700 ml-2 whitespace-nowrap">
                        {event.credits_required} {event.credits_required === 1 ? 'credit' : 'credits'}
                      </span>
                    </div>
                    
                    <p className="text-gray-700 text-sm mb-3 line-clamp-2">{event.description}</p>
                    
                    <div className="flex justify-between gap-4 text-xs text-gray-600 mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-1 mb-1">
                          <span>📅</span>
                          <span>{formatDateTime(event.date)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>📍</span>
                          <span>{event.location}</span>
                        </div>
                        {!isRegistrationOpen && registrationOpensAt && (
                          <div className="flex items-center gap-1 text-orange-600 font-semibold mt-1">
                            <span>⏰</span>
                            <span>Opens: {formatDateTime(registrationOpensAt)}</span>
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        {event.max_attendees && (
                          <div className="mb-1">
                            <span>👥 Max {event.max_attendees}</span>
                          </div>
                        )}
                        {event.theme && (
                          <div>
                            <span>🎨 {event.theme}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500">
                        ⏱️ Cancel {event.cancellation_hours || 4}h before
                      </p>
                      
                      {isBooked ? (
                        booking.status === 'waitlist' ? (
                          <span className="text-yellow-600 font-semibold text-xs">⏳ Waitlisted</span>
                        ) : (
                          <span className="text-green-600 font-semibold text-xs">✓ Booked</span>
                        )
                      ) : !isRegistrationOpen ? (
                        <span className="text-orange-600 font-semibold text-xs">
                          Not Open
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBookEvent(event)}
                          disabled={!canAfford || isBooking}
                          className="bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-xs font-medium whitespace-nowrap"
                        >
                          {isBooking 
                            ? 'Booking...' 
                            : !canAfford 
                              ? 'Not enough credits' 
                              : isFull 
                                ? 'Join Waitlist' 
                                : 'Book Event'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Past Bookings Section */}
        {myBookings.filter((booking) => new Date(booking.events.date) < currentTime).length > 0 && (
          <div className="mt-8">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">Past Bookings</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myBookings
                .filter((booking) => new Date(booking.events.date) < currentTime)
                .sort((a, b) => new Date(b.events.date).getTime() - new Date(a.events.date).getTime())
                .map((booking) => {
                  const eventDate = new Date(booking.events.date)
                  const isWaitlist = booking.status === 'waitlist'
                  const borderColor = isWaitlist ? 'border-yellow-500' : 'border-gray-400'

                  return (
                    <div key={booking.id} className={`bg-white rounded-lg shadow p-4 border-l-4 ${borderColor} opacity-75`}>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-lg flex-1">
                          <Link 
                            href={`/events/${booking.event_id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {booking.events.title}
                          </Link>
                        </h3>
                        {isWaitlist ? (
                          <span className="text-yellow-600 font-semibold text-xs ml-2 whitespace-nowrap">
                            ⏳ #{booking.waitlist_position}
                          </span>
                        ) : (
                          <span className="text-green-600 font-semibold text-xs ml-2">✓</span>
                        )}
                      </div>
                      
                      <p className="text-gray-600 text-sm mb-3 line-clamp-2">{booking.events.description}</p>
                      
                      <div className="flex justify-between gap-4 text-xs text-gray-500 mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-1 mb-1">
                            <span>📅</span>
                            <span>{formatDateTime(booking.events.date)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span>📍</span>
                            <span>{booking.events.location}</span>
                          </div>
                        </div>
                        <div className="text-right">
                          {booking.events.max_attendees && (
                            <div className="mb-1">
                              <span>👥 Max {booking.events.max_attendees}</span>
                            </div>
                          )}
                          {booking.events.theme && (
                            <div>
                              <span>🎨 {booking.events.theme}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <span>💳</span>
                          <span>{booking.credits_used} credit{booking.credits_used > 1 ? 's' : ''}</span>
                        </div>
                        <div className="flex items-center gap-1 text-gray-400">
                          <span>✓</span>
                          <span>Completed</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}