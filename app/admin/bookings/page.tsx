'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/dateUtils'

type BookingWithDetails = {
  id: string
  credits_used: number
  booked_at: string
  status: string
  waitlist_position: number | null
  profiles: {
    full_name: string
    email: string
  }
  events: {
    title: string
    date: string
    location: string
  }
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<BookingWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'waitlist'>('all')

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    setLoading(true)
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        profiles (full_name, email),
        events (title, date, location)
      `)
      .order('booked_at', { ascending: false })

    if (!error && data) {
      setBookings(data as any)
    }
    setLoading(false)
  }

  const filteredBookings = bookings.filter(booking => {
    if (filter === 'all') return booking.status === 'confirmed' || booking.status === 'waitlist'
    return booking.status === filter
  })

  if (loading) {
    return <div className="text-center py-8">Loading bookings...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Booking Management</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          >
            All ({bookings.filter(b => b.status === 'confirmed' || b.status === 'waitlist').length})
          </button>
          <button
            onClick={() => setFilter('confirmed')}
            className={`px-4 py-2 rounded ${filter === 'confirmed' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}
          >
            Confirmed ({bookings.filter(b => b.status === 'confirmed').length})
          </button>
          <button
            onClick={() => setFilter('waitlist')}
            className={`px-4 py-2 rounded ${filter === 'waitlist' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`}
          >
            Waitlist ({bookings.filter(b => b.status === 'waitlist').length})
          </button>
        </div>
      </div>

      {/* Bookings Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Event Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Credits Used
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Booked On
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredBookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">
                    {booking.profiles.full_name}
                  </div>
                  <div className="text-sm text-gray-500">
                    {booking.profiles.email}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-900">{booking.events.title}</div>
                  <div className="text-sm text-gray-500">{booking.events.location}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(booking.events.date)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                    {booking.credits_used}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {formatDate(booking.booked_at)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    booking.status === 'confirmed' 
                      ? 'bg-green-100 text-green-800' 
                      : booking.status === 'waitlist'
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}>
                    {booking.status === 'waitlist' && booking.waitlist_position
                      ? `Waitlist #${booking.waitlist_position}`
                      : booking.status
                    }
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredBookings.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No {filter !== 'all' ? filter : ''} bookings yet
        </div>
      )}
    </div>
  )
}