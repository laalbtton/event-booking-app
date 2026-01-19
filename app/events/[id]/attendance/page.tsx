'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'
import Link from 'next/link'

type BookingWithProfile = {
  id: string
  user_id: string
  status: string
  attendance_status: string | null
  booked_at: string
  profiles: {
    id: string
    full_name: string
    email: string
  }
}

type EventDetails = {
  id: string
  title: string
  date: string
  host_user_id: string | null
  created_by: string | null
}

export default function AttendancePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [bookings, setBookings] = useState<BookingWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hostProfile, setHostProfile] = useState<{ id: string; full_name: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    attended: 0,
    noShow: 0,
    pending: 0
  })

  useEffect(() => {
    checkAuth()
  }, [])

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

    // Only event_creator and admin can access this page
    if (profile.role !== 'event_creator' && profile.role !== 'admin') {
      router.push('/dashboard')
      return
    }

    setUserRole(profile.role)
    await loadData(user.id)
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

      // Load event
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, title, date, host_user_id, created_by')
        .eq('id', eventId)
        .single()

      if (eventError) throw eventError

      // Event creators can only access their own events
      if (currentUserRole === 'event_creator' && eventData.created_by !== userId) {
        router.push('/events/manage')
        return
      }

      setEvent(eventData)

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
          status,
          attendance_status,
          booked_at,
          profiles (
            id,
            full_name,
            email
          )
        `)
        .eq('event_id', eventId)
        .eq('status', 'confirmed')
        .order('booked_at', { ascending: true })

      if (bookingsError) throw bookingsError
      setBookings(bookingsData as any)

      // Calculate stats
      const total = bookingsData?.length || 0
      const attended = bookingsData?.filter((b: any) => b.attendance_status === 'attended').length || 0
      const noShow = bookingsData?.filter((b: any) => b.attendance_status === 'no_show').length || 0
      const confirmed = bookingsData?.filter((b: any) => !b.attendance_status || b.attendance_status === 'confirmed').length || 0
      const pending = bookingsData?.filter((b: any) => !b.attendance_status).length || 0

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

  async function updateAttendance(bookingId: string, status: 'attended' | 'no_show' | null) {
    setUpdating(bookingId)
    try {
      const { error } = await supabase
        .from('bookings')
        .update({ attendance_status: status })
        .eq('id', bookingId)

      if (error) throw error

      await loadData((await supabase.auth.getUser()).data.user!.id)
    } catch (error: any) {
      console.error('Error updating attendance:', error)
      alert('Error updating attendance: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function setHost(userId: string | null) {
    setUpdating('host')
    try {
      const { error } = await supabase
        .from('events')
        .update({ host_user_id: userId })
        .eq('id', eventId)

      if (error) throw error

      await loadData((await supabase.auth.getUser()).data.user!.id)
      alert(userId ? 'Host assigned successfully!' : 'Host removed successfully!')
    } catch (error: any) {
      console.error('Error setting host:', error)
      alert('Error setting host: ' + error.message)
    } finally {
      setUpdating(null)
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link
              href="/events/manage"
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Events
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Info */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{event.title}</h2>
          <p className="text-gray-600 mb-4">
            📅 {formatDateTime(event.date)}
          </p>
          
          {/* Host Section */}
          <div className="border-t pt-4 mt-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">Event Host</h3>
            {hostProfile ? (
              <div className="flex items-center justify-between bg-indigo-50 p-4 rounded-lg">
                <div>
                  <p className="font-semibold text-indigo-900">👤 {hostProfile.full_name}</p>
                  <p className="text-sm text-indigo-700">Currently assigned as host</p>
                </div>
                <button
                  onClick={() => setHost(null)}
                  disabled={updating === 'host'}
                  className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {updating === 'host' ? 'Removing...' : 'Remove Host'}
                </button>
              </div>
            ) : (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-600 mb-2">No host assigned (TBD)</p>
                <p className="text-sm text-gray-500">Select a host from the attendees list below</p>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Total Registered</h3>
            <p className="text-2xl font-bold text-blue-700">{stats.total}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-green-900 mb-1">Attended</h3>
            <p className="text-2xl font-bold text-green-700">{stats.attended}</p>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-red-900 mb-1">No Show</h3>
            <p className="text-2xl font-bold text-red-700">{stats.noShow}</p>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg">
            <h3 className="text-sm font-semibold text-yellow-900 mb-1">Pending</h3>
            <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
          </div>
        </div>

        {/* Bookings List */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-bold text-gray-900 mb-4">
            Confirmed Bookings ({bookings.length})
          </h3>

          {bookings.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No confirmed bookings for this event</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Name</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Email</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Booked At</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Status</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => {
                    const attendanceStatus = booking.attendance_status
                    const isUpdating = updating === booking.id

                    return (
                      <tr key={booking.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <Link
                            href={`/profile/${booking.profiles.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {booking.profiles.full_name || 'No name'}
                          </Link>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{booking.profiles.email}</td>
                        <td className="py-3 px-4 text-gray-600 text-sm">
                          {formatDateTime(booking.booked_at)}
                        </td>
                        <td className="py-3 px-4">
                          {attendanceStatus === 'attended' && (
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm font-semibold">
                              ✓ Attended
                            </span>
                          )}
                          {attendanceStatus === 'no_show' && (
                            <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-sm font-semibold">
                              ✗ No Show
                            </span>
                          )}
                          {!attendanceStatus && (
                            <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm font-semibold">
                              ⏳ Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <button
                                onClick={() => updateAttendance(booking.id, 'attended')}
                                disabled={isUpdating || attendanceStatus === 'attended'}
                                className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                              >
                                {isUpdating && attendanceStatus !== 'attended' ? '...' : 'Mark Attended'}
                              </button>
                              <button
                                onClick={() => updateAttendance(booking.id, 'no_show')}
                                disabled={isUpdating || attendanceStatus === 'no_show'}
                                className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                              >
                                {isUpdating && attendanceStatus !== 'no_show' ? '...' : 'Mark No Show'}
                              </button>
                              {attendanceStatus && (
                                <button
                                  onClick={() => updateAttendance(booking.id, null)}
                                  disabled={isUpdating}
                                  className="bg-gray-600 text-white px-3 py-1 rounded text-sm hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                                >
                                  {isUpdating ? '...' : 'Reset'}
                                </button>
                              )}
                            </div>
                            <button
                              onClick={() => setHost(booking.user_id)}
                              disabled={updating === 'host' || event.host_user_id === booking.user_id}
                              className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                            >
                              {updating === 'host' && event.host_user_id === booking.user_id 
                                ? '...' 
                                : event.host_user_id === booking.user_id 
                                  ? '✓ Current Host' 
                                  : 'Set as Host'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
