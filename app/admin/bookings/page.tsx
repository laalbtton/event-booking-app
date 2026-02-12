'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

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
  const [loadError, setLoadError] = useState<string>('')
  const [filter, setFilter] = useState<'all' | 'confirmed' | 'waitlist'>('all')

  useEffect(() => {
    loadBookings()
  }, [])

  async function loadBookings() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        *,
        profiles (full_name, email),
        events (title, date, location)
      `)
      .order('booked_at', { ascending: false })

    if (error) {
      console.error('Error loading bookings:', error)
      setBookings([])
      setLoadError(error.message || 'Failed to load bookings')
      setLoading(false)
      return
    }

    setBookings((data || []) as any)
    setLoading(false)
  }

  const filteredBookings = bookings.filter(booking => {
    if (filter === 'all') return booking.status === 'confirmed' || booking.status === 'waitlist'
    return booking.status === filter
  })

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div>
      {loadError && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="text-sm text-red-600">{loadError}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              If this is a permission error, it’s typically Supabase RLS blocking admin reads on `bookings` (and embedded `profiles`).
            </div>
          </CardContent>
        </Card>
      )}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({bookings.filter(b => b.status === 'confirmed' || b.status === 'waitlist').length})
        </Button>
        <Button
          variant={filter === 'confirmed' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('confirmed')}
        >
          Confirmed ({bookings.filter(b => b.status === 'confirmed').length})
        </Button>
        <Button
          variant={filter === 'waitlist' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('waitlist')}
        >
          Waitlist ({bookings.filter(b => b.status === 'waitlist').length})
        </Button>
      </div>

      {/* Bookings Table */}
      <Card>
        <CardContent className="p-0">
          {filteredBookings.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              No {filter !== 'all' ? filter : ''} bookings yet
            </div>
          ) : (
            <div className="overflow-x-auto">
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
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(booking.events.date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="secondary">{booking.credits_used}</Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(booking.booked_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge
                          variant={
                            booking.status === 'confirmed'
                              ? 'default'
                              : booking.status === 'waitlist'
                              ? 'outline'
                              : 'secondary'
                          }
                          className={cn(
                            booking.status === 'confirmed' && 'bg-green-100 text-green-800',
                            booking.status === 'waitlist' && 'bg-yellow-100 text-yellow-800'
                          )}
                        >
                          {booking.status === 'waitlist' && booking.waitlist_position
                            ? `Waitlist #${booking.waitlist_position}`
                            : booking.status
                          }
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
