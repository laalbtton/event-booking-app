'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { GripVertical, User, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

type BookingWithProfile = {
  id: string
  user_id: string
  status: string
  attendance_status: string | null
  booked_at: string
  waitlist_position?: number | null
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

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function AttendancePage() {
  const params = useParams()
  const router = useRouter()
  const eventId = params.id as string

  const [event, setEvent] = useState<EventDetails | null>(null)
  const [bookings, setBookings] = useState<BookingWithProfile[]>([])
  const [waitlistBookings, setWaitlistBookings] = useState<BookingWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [hostProfile, setHostProfile] = useState<{ id: string; full_name: string } | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [canManageHost, setCanManageHost] = useState(false)
  const [stats, setStats] = useState({
    total: 0,
    confirmed: 0,
    attended: 0,
    noShow: 0,
    pending: 0
  })
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDraggingOverHost, setIsDraggingOverHost] = useState(false)
  const [isDraggingOverWaitlist, setIsDraggingOverWaitlist] = useState(false)
  const [isDraggingOverConfirmed, setIsDraggingOverConfirmed] = useState(false)
  const [swipingId, setSwipingId] = useState<string | null>(null)
  const [swipeOffset, setSwipeOffset] = useState<Record<string, number>>({})
  const [swipeDirection, setSwipeDirection] = useState<Record<string, 'left' | 'right'>>({})
  const touchStartX = useRef<Record<string, number>>({})
  const touchStartY = useRef<Record<string, number>>({})

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

      // Check access: event creators can only access their own events
      // Admins can access all events
      // Hosts can access events where they are assigned as host
      const isEventCreator = currentUserRole === 'event_creator' && eventData.created_by === userId
      const isAdmin = currentUserRole === 'admin'
      const isHost = eventData.host_user_id === userId

      if (!isEventCreator && !isAdmin && !isHost) {
        router.push('/dashboard')
        return
      }

      // Only event creators and admins can manage host assignments
      setCanManageHost(isEventCreator || isAdmin)

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
          waitlist_position,
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

      const { data: waitlistData, error: waitlistError } = await supabase
        .from('bookings')
        .select(`
          id,
          user_id,
          status,
          attendance_status,
          booked_at,
          waitlist_position,
          profiles (
            id,
            full_name,
            email
          )
        `)
        .eq('event_id', eventId)
        .eq('status', 'waitlist')
        .order('waitlist_position', { ascending: true })
        .order('booked_at', { ascending: true })

      if (waitlistError) throw waitlistError
      setWaitlistBookings(waitlistData as any)

      // Calculate stats
      const total = bookingsData?.length || 0
      const attended = bookingsData?.filter((b: any) => b.attendance_status === 'attended').length || 0
      const noShow = total - attended // All non-attended are no shows by default
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

  function recalcStats(updatedBookings: BookingWithProfile[]) {
    const total = updatedBookings.length
    const attended = updatedBookings.filter((b) => b.attendance_status === 'attended').length
    const noShow = total - attended
    const confirmed = updatedBookings.filter((b) => !b.attendance_status || b.attendance_status === 'confirmed').length
    const pending = updatedBookings.filter((b) => !b.attendance_status).length

    setStats({
      total,
      confirmed,
      attended,
      noShow,
      pending
    })
  }

  async function updateAttendance(bookingId: string, status: 'attended' | null) {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/update-attendance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId, status }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update attendance')
      }

      setBookings((prev) => {
        const updated = prev.map((booking) =>
          booking.id === bookingId
            ? { ...booking, attendance_status: status }
            : booking
        )
        recalcStats(updated)
        return updated
      })
    } catch (error: any) {
      console.error('Error updating attendance:', error)
      alert('Error updating attendance: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function updateBookingStatus(bookingId: string, nextStatus: 'confirmed' | 'waitlist') {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/update-booking-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId, status: nextStatus }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update booking')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      console.error('Error updating booking:', error)
      alert('Error updating booking: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function removeAttendee(bookingId: string) {
    setUpdating(bookingId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/remove-attendee', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ bookingId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to remove attendee')
      }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await loadData(user.id)
      }
    } catch (error: any) {
      console.error('Error removing attendee:', error)
      alert('Error removing attendee: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  function copyAttendanceList() {
    const attended = bookings.filter((booking) => booking.attendance_status === 'attended')
    const noShow = bookings.filter((booking) => booking.attendance_status !== 'attended')

    const attendedLines = attended.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}`
    )
    const noShowLines = noShow.map((booking, index) =>
      `${index + 1}. ${booking.profiles.full_name || 'No name'}`
    )

    let text = `Attending (${attendedLines.length})\n${attendedLines.join('\n') || 'None'}`
    text += `\n\nNo Show (${noShowLines.length})\n${noShowLines.join('\n') || 'None'}`

    navigator.clipboard.writeText(text)
    alert('Attendance list copied!')
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
    } catch (error: any) {
      console.error('Error setting host:', error)
      alert('Error setting host: ' + error.message)
    } finally {
      setUpdating(null)
    }
  }

  async function reorderBookings(newOrder: BookingWithProfile[]) {
    // Note: This is a UI-only reorder. If you need to persist order in the database,
    // you would need to add an order field to the bookings table.
    setBookings(newOrder)
  }

  function handleDragStart(e: React.DragEvent, bookingId: string) {
    setDraggedItem(bookingId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e: React.DragEvent, index?: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (index !== undefined) {
      setDragOverIndex(index)
    }
  }

  function handleDragLeave() {
    setDragOverIndex(null)
    setIsDraggingOverHost(false)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleDrop(e: React.DragEvent, targetIndex?: number) {
    e.preventDefault()
    
    if (!draggedItem) return

    // Handle drop on host zone
    if (isDraggingOverHost && canManageHost) {
      const booking = bookings.find(b => b.id === draggedItem)
      if (booking) {
        setHost(booking.user_id)
      }
      setIsDraggingOverHost(false)
      setDraggedItem(null)
      return
    }

    // Handle reordering
    if (targetIndex !== undefined && draggedItem) {
      const draggedIndex = bookings.findIndex(b => b.id === draggedItem)
      if (draggedIndex !== -1 && draggedIndex !== targetIndex) {
        const newBookings = [...bookings]
        const [removed] = newBookings.splice(draggedIndex, 1)
        newBookings.splice(targetIndex, 0, removed)
        reorderBookings(newBookings)
      }
    }

    setDragOverIndex(null)
    setDraggedItem(null)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleHostDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverHost(true)
  }

  function handleWaitlistDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverWaitlist(true)
  }

  function handleConfirmedDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDraggingOverConfirmed(true)
  }

  function handleDropToStatus(status: 'confirmed' | 'waitlist') {
    if (!draggedItem) return
    const isAlreadyConfirmed = bookings.some((booking) => booking.id === draggedItem)
    const isAlreadyWaitlist = waitlistBookings.some((booking) => booking.id === draggedItem)
    if (status === 'confirmed' && isAlreadyConfirmed) return
    if (status === 'waitlist' && isAlreadyWaitlist) return
    updateBookingStatus(draggedItem, status)
    setDraggedItem(null)
    setIsDraggingOverWaitlist(false)
    setIsDraggingOverConfirmed(false)
  }

  function handleTouchStart(e: React.TouchEvent, bookingId: string) {
    touchStartX.current[bookingId] = e.touches[0].clientX
    touchStartY.current[bookingId] = e.touches[0].clientY
    setSwipingId(bookingId)
  }

  function handleTouchMove(e: React.TouchEvent, bookingId: string) {
    if (swipingId !== bookingId) return

    const currentX = e.touches[0].clientX
    const currentY = e.touches[0].clientY
    const startX = touchStartX.current[bookingId]
    const startY = touchStartY.current[bookingId]

    const deltaX = currentX - startX
    const deltaY = Math.abs(currentY - startY)

    if (deltaY < 50 && deltaX < 0) {
      const offset = Math.max(deltaX, -100)
      setSwipeOffset(prev => ({ ...prev, [bookingId]: offset }))
      setSwipeDirection(prev => ({ ...prev, [bookingId]: 'left' }))
    }
  }

  function handleTouchEnd(bookingId: string) {
    const offset = swipeOffset[bookingId] || 0
    const direction = swipeDirection[bookingId]

    if (direction === 'left' && offset < -50) {
      removeAttendee(bookingId)
    }

    setSwipeOffset(prev => {
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setSwipeDirection(prev => {
      const next = { ...prev }
      delete next[bookingId]
      return next
    })
    setSwipingId(null)
    touchStartX.current[bookingId] = 0
    touchStartY.current[bookingId] = 0
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
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href={`/events/${eventId}`}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Event Details
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Management</h1>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Event Info */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-2xl">{event.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {formatDateTime(event.date)}
            </p>
          </CardHeader>
          <CardContent>
            {/* Host Section - Only show if user can manage hosts */}
            {canManageHost && (
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">Event Host</h3>
                <div
                  onDragOver={handleHostDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={cn(
                    "min-h-[100px] p-4 rounded-lg border-2 border-dashed transition-colors",
                    isDraggingOverHost
                      ? "bg-indigo-100 border-indigo-400"
                      : hostProfile
                      ? "bg-indigo-50 border-indigo-200"
                      : "bg-gray-50 border-gray-300"
                  )}
                >
                  {hostProfile ? (
                    <div className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>
                          {getInitials(hostProfile.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold text-indigo-900">{hostProfile.full_name}</p>
                        <p className="text-sm text-indigo-700">Currently assigned as host</p>
                      </div>
                      <Button
                        onClick={() => setHost(null)}
                        disabled={updating === 'host'}
                        variant="destructive"
                        size="sm"
                      >
                        {updating === 'host' ? 'Removing...' : 'Remove Host'}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-center">
                      <div>
                        <User className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                        <p className="text-gray-600 mb-1">No host assigned</p>
                        <p className="text-sm text-gray-500">Drag an attendee here to assign as host</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bookings List */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Confirmed Bookings ({bookings.length})</CardTitle>
            <Button variant="outline" size="icon" onClick={copyAttendanceList} aria-label="Copy attendance list">
              <Copy className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent
            onDragOver={handleConfirmedDragOver}
            onDragLeave={handleDragLeave}
            onDrop={() => handleDropToStatus('confirmed')}
            className={cn(
              isDraggingOverConfirmed && "rounded-lg bg-blue-50 border border-blue-200"
            )}
          >
            {bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No confirmed bookings for this event</p>
            ) : (
              <div className="space-y-2">
                {bookings.map((booking, index) => {
                  const attendanceStatus = booking.attendance_status
                  const isUpdating = updating === booking.id
                  const isDragged = draggedItem === booking.id
                  const isDragOver = dragOverIndex === index

                  return (
                    <div
                      key={booking.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, booking.id)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onTouchStart={(e) => handleTouchStart(e, booking.id)}
                      onTouchMove={(e) => handleTouchMove(e, booking.id)}
                      onTouchEnd={() => handleTouchEnd(booking.id)}
                      style={{ transform: `translateX(${swipeOffset[booking.id] || 0}px)` }}
                      className={cn(
                        "flex items-center gap-2 sm:gap-3 p-3 rounded-lg border transition-all cursor-move",
                        isDragged && "opacity-50",
                        isDragOver && "border-blue-400 bg-blue-50",
                        !isDragged && !isDragOver && "hover:bg-gray-50"
                      )}
                    >
                      <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />

                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/profile/${booking.profiles.id}`}
                          className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {booking.profiles.full_name || 'No name'}
                        </Link>
                        <span className="hidden sm:inline text-xs text-muted-foreground">
                          {formatDateTime(booking.booked_at)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Switch
                          checked={attendanceStatus === 'attended'}
                          disabled={isUpdating}
                          onCheckedChange={(checked) => updateAttendance(booking.id, checked ? 'attended' : null)}
                          aria-label="Mark attended"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div
              className={cn("mt-6 rounded-lg", isDraggingOverWaitlist && "bg-blue-50 border border-blue-200")}
              onDragOver={handleWaitlistDragOver}
              onDragLeave={handleDragLeave}
              onDrop={() => handleDropToStatus('waitlist')}
            >
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Waitlist ({waitlistBookings.length})
              </h3>
              {waitlistBookings.length === 0 ? (
                <p className="text-muted-foreground text-center py-6 text-sm">No waitlisted attendees</p>
              ) : (
                <div className="space-y-2">
                  {waitlistBookings.map((booking) => {
                    const isUpdating = updating === booking.id
                    return (
                      <div
                        key={booking.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, booking.id)}
                        className="flex items-center gap-2 sm:gap-3 p-3 rounded-lg border transition-all hover:bg-gray-50"
                      >
                        <span className="text-xs font-semibold text-muted-foreground w-6 text-center">
                          {booking.waitlist_position ?? '-'}
                        </span>
                        <div className="flex-1 min-w-0">
                          <Link
                            href={`/profile/${booking.profiles.id}`}
                            className="font-medium text-blue-600 hover:text-blue-800 hover:underline block truncate"
                          >
                            {booking.profiles.full_name || 'No name'}
                          </Link>
                        </div>
                        {isUpdating && (
                          <span className="text-xs text-muted-foreground">Updating...</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Stats - Moved to bottom */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mt-6">
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Total Registered</div>
              <div className="text-xl md:text-2xl font-bold text-blue-700">{stats.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Attended</div>
              <div className="text-xl md:text-2xl font-bold text-green-700">{stats.attended}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">No Show</div>
              <div className="text-xl md:text-2xl font-bold text-red-700">{stats.noShow}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 md:p-6">
              <div className="text-xs md:text-sm font-medium text-muted-foreground mb-0.5 md:mb-1">Pending</div>
              <div className="text-xl md:text-2xl font-bold text-yellow-700">{stats.pending}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Navigation */}
      <NavigationTabs />
    </div>
  )
}
