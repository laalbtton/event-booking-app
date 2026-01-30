'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import NavigationTabs from '@/components/NavigationTabs'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCode, Link as LinkIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

type Venue = {
  id: string
  name: string
  address: string
}

export default function EventManagementPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')
  const [venues, setVenues] = useState<Venue[]>([])
  const router = useRouter()
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    theme: '',
    rating: '18+',
    date: '',
    end_time: '',
    duration_hours: '2',
    venue_id: '',
    credits_required: '5',
    max_attendees: '',
    cancellation_hours: '4',
    open_registration_now: true,
    registration_opens_at: ''
  })

  function toLocalDateTimeString(date: Date): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  }

  function computeEndTime(startValue: string, durationMinutes: number): string {
    if (!startValue) return ''
    const start = new Date(startValue)
    if (Number.isNaN(start.getTime())) return ''
    return toLocalDateTimeString(new Date(start.getTime() + durationMinutes * 60000))
  }

  function computeDurationMinutes(startValue: string, endValue: string): number | null {
    if (!startValue || !endValue) return null
    const start = new Date(startValue)
    const end = new Date(endValue)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
    const diffMinutes = Math.round((end.getTime() - start.getTime()) / 60000)
    if (diffMinutes <= 0) return null
    return Math.round(diffMinutes / 30) * 30
  }

  function minutesToHoursString(minutes: number): string {
    return (minutes / 60).toString()
  }

  function hoursToMinutes(hoursValue: string): number {
    const hours = parseFloat(hoursValue)
    if (Number.isNaN(hours) || hours <= 0) return 120
    return Math.round(hours * 60)
  }

  useEffect(() => {
    checkAccess()
    loadVenues()
  }, [])

  async function checkAccess() {
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
    loadEvents()
  }

  async function loadEvents() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Event creators can only see their own events, admins see all
    let query = supabase
      .from('events')
      .select('*, venue_id')
      .order('date', { ascending: true })

    if (userRole === 'event_creator') {
      query = query.eq('created_by', user.id)
    }

    const { data, error } = await query

    if (!error && data) {
      setEvents(data)
    }
    setLoading(false)
  }

  async function loadVenues() {
    try {
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('id, name, address')
        .order('name', { ascending: true })

      if (venuesError) throw venuesError
      setVenues(venuesData || [])
    } catch (error: any) {
      console.error('Error loading venues:', error)
    }
  }

  function resetFormData() {
    setFormData({
      title: '',
      description: '',
      theme: '',
      rating: '18+',
      date: '',
      end_time: '',
      duration_hours: '2',
      venue_id: '',
      credits_required: '5',
      max_attendees: '',
      cancellation_hours: '4',
      open_registration_now: true,
      registration_opens_at: ''
    })
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get venue address if venue is selected
      let location = ''
      if (formData.venue_id) {
        const selectedVenue = venues.find(v => v.id === formData.venue_id)
        if (selectedVenue) {
          location = `${selectedVenue.name}, ${selectedVenue.address}`
        }
      }

      if (!formData.venue_id) {
        alert('Please select a venue')
        setSubmitting(false)
        return
      }

      const durationMinutes = hoursToMinutes(formData.duration_hours)
      const endTimeValue = formData.end_time || computeEndTime(formData.date, durationMinutes)
      const endTimeIso = endTimeValue ? new Date(endTimeValue).toISOString() : null

      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        venue_id: formData.venue_id || null,
        location: location,
        credits_required: parseInt(formData.credits_required),
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        cancellation_hours: parseInt(formData.cancellation_hours),
        registration_opens_at: formData.open_registration_now 
          ? null 
          : formData.registration_opens_at 
            ? new Date(formData.registration_opens_at).toISOString() 
            : null,
        created_by: user.id, // Track who created the event
        host_user_id: user.id // Assign creator as host by default
      }

      const { data, error } = await supabase
        .from('events')
        .insert(eventData)
        .select()
        .single()

      if (error) {
        console.error('Error creating event:', error)
        throw error
      }

      // Assign creator as attending by default (non-blocking)
      try {
        await supabase
          .from('bookings')
          .insert({
            user_id: user.id,
            event_id: data.id,
            credits_used: 0,
            status: 'confirmed',
            attendance_status: null,
          })
      } catch (bookingError) {
        console.warn('Failed to auto-book creator as attendee:', bookingError)
      }

      alert('Event created successfully!')
      setShowCreateForm(false)
      resetFormData()
      loadEvents()
    } catch (error: any) {
      console.error('Full error:', error)
      alert('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEditEvent(event: Event) {
    setEditingEvent(event)
    const eventDate = new Date(event.date)
    const localDateTime = toLocalDateTimeString(eventDate)
    
    const regOpensAt = event.registration_opens_at
      ? toLocalDateTimeString(new Date(event.registration_opens_at))
      : ''

    const endTimeValue = (event as any).end_time
      ? toLocalDateTimeString(new Date((event as any).end_time))
      : computeEndTime(localDateTime, 120)
    const durationMinutes = computeDurationMinutes(localDateTime, endTimeValue) || 120

    // Load venue_id if it exists
    let venueId = ''
    if ((event as any).venue_id) {
      venueId = (event as any).venue_id
    }

    setFormData({
      title: event.title,
      description: event.description || '',
      theme: event.theme || '',
      rating: (event as any).rating || '18+',
      date: localDateTime,
      end_time: endTimeValue,
      duration_hours: minutesToHoursString(durationMinutes),
      venue_id: venueId,
      credits_required: event.credits_required.toString(),
      max_attendees: event.max_attendees ? event.max_attendees.toString() : '',
      cancellation_hours: event.cancellation_hours.toString(),
      open_registration_now: !event.registration_opens_at,
      registration_opens_at: regOpensAt
    })
    setShowEditForm(true)
  }

  async function handleUpdateEvent(e: React.FormEvent) {
    e.preventDefault()
    if (!editingEvent) return

    setSubmitting(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Check if user can edit this event (must be creator or admin)
      if (userRole === 'event_creator' && editingEvent.created_by !== user.id) {
        throw new Error('You can only edit events you created')
      }

      // Get venue address for selected venue
      let locationValue = ''
      if (formData.venue_id) {
        const selectedVenue = venues.find(v => v.id === formData.venue_id)
        if (selectedVenue) {
          locationValue = `${selectedVenue.name}, ${selectedVenue.address}`
        }
      }

      if (!formData.venue_id) {
        alert('Please select a venue')
        setSubmitting(false)
        return
      }

      const durationMinutes = hoursToMinutes(formData.duration_hours)
      const endTimeValue = formData.end_time || computeEndTime(formData.date, durationMinutes)
      const endTimeIso = endTimeValue ? new Date(endTimeValue).toISOString() : null

      const previousMax = editingEvent.max_attendees ?? null
      const nextMax = formData.max_attendees ? parseInt(formData.max_attendees) : null

      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        location: locationValue,
        credits_required: parseInt(formData.credits_required),
        max_attendees: nextMax,
        cancellation_hours: parseInt(formData.cancellation_hours),
        registration_opens_at: formData.open_registration_now 
          ? null 
          : formData.registration_opens_at 
            ? new Date(formData.registration_opens_at).toISOString() 
            : null,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('events')
        .update(eventData)
        .eq('id', editingEvent.id)

      if (error) {
        console.error('Error updating event:', error)
        throw error
      }

      if (previousMax !== null && nextMax !== null && nextMax > previousMax) {
        const promotionsNeeded = nextMax - previousMax
        for (let i = 0; i < promotionsNeeded; i += 1) {
          const { data: promoteResult } = await supabase.rpc('promote_waitlist_and_update_positions', {
            event_uuid: editingEvent.id
          })
          if (!promoteResult || !promoteResult.promoted) {
            break
          }
        }
      }

      alert('Event updated successfully!')
      setShowEditForm(false)
      setEditingEvent(null)
      resetFormData()
      loadEvents()
    } catch (error: any) {
      console.error('Full error:', error)
      alert('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCancelEvent(eventId: string, eventTitle: string) {
    if (!confirm(`Cancel "${eventTitle}" and refund all attendees? This cannot be undone.`)) {
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await fetch('/api/cancel-event', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ eventId }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to cancel event')
      }

      const data = await response.json()
      if (data.alreadyCancelled) {
        alert('This event is already cancelled.')
        return
      }

      alert('Event cancelled and refunds processed.')
      loadEvents()
    } catch (error: any) {
      console.error('Error cancelling event:', error)
      alert('Error: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <NavigationTabs />
        <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
          <div className="space-y-4">
            <Skeleton className="h-10 w-48" />
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Navigation Tabs */}
      <NavigationTabs />

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight">My Events</CardTitle>
          <Button onClick={() => setShowCreateForm(true)}>
            + Create Event
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upcoming' | 'past')} className="mb-6">
          <TabsList>
            <TabsTrigger value="upcoming">Upcoming Events</TabsTrigger>
            <TabsTrigger value="past">Past Events</TabsTrigger>
          </TabsList>

          {/* Events Grid */}
          <TabsContent value={activeTab} className="mt-6">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {events
                .filter((event) => {
                  const eventDate = new Date(event.date)
                  const now = new Date()
                  if (activeTab === 'upcoming') {
                    return eventDate >= now
                  } else {
                    return eventDate < now
                  }
                })
                .sort((a, b) => {
                  const dateA = new Date(a.date).getTime()
                  const dateB = new Date(b.date).getTime()
                  return activeTab === 'upcoming' ? dateA - dateB : dateB - dateA
                })
                .map((event) => (
                <Card key={event.id} className="shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg font-bold">{event.title}</CardTitle>
                      {event.status === 'cancelled' && (
                        <Badge variant="destructive">Cancelled</Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2">{event.description}</p>
                    
                    <div className="text-sm text-muted-foreground space-y-1.5">
                      <p>📅 {formatDateTime(event.date)}</p>
                      <p>📍 {event.location}</p>
                      {event.theme && <p>🎨 Theme: {event.theme}</p>}
                      <p>🔞 {event.rating || '18+'}</p>
                      <p>💳 {event.credits_required} credits</p>
                      {event.max_attendees && <p>👥 Max {event.max_attendees} attendees</p>}
                      <p>⏱️ Cancel up to {event.cancellation_hours || 4} hours before</p>
                    </div>

                    <Separator />

                    <div className="flex flex-wrap gap-2">
                      {activeTab === 'upcoming' && (
                        <>
                          <Button
                            onClick={() => handleEditEvent(event)}
                            size="sm"
                            className="flex-1"
                            title="Edit Event"
                            disabled={event.status === 'cancelled'}
                          >
                            ✏️ Edit Details
                          </Button>
                          
                          <Button
                            onClick={() => handleCancelEvent(event.id, event.title)}
                            variant="destructive"
                            size="sm"
                            disabled={event.status === 'cancelled'}
                            title="Cancel Event"
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      
                      <Button
                        onClick={() => {
                          const publicUrl = `${window.location.origin}/event-public/${event.id}`
                          navigator.clipboard.writeText(publicUrl)
                          alert('Public link copied!')
                        }}
                        variant="outline"
                        size="sm"
                        className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                        title="Copy Public Link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </Button>

                      {activeTab === 'upcoming' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
                            asChild
                            title="Generate QR Code"
                          >
                            <Link href={`/events/${event.id}/qr`}>
                              <QrCode className="w-4 h-4" />
                            </Link>
                          </Button>

                          <Button
                            variant="outline"
                            size="sm"
                            className="bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700"
                            asChild
                            title="Manage Attendance"
                          >
                            <Link href={`/events/${event.id}/attendance`}>
                              👥
                            </Link>
                          </Button>
                        </>
                      )}

                      {activeTab === 'past' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700 flex-1"
                          asChild
                          title="View Attendance"
                        >
                          <Link href={`/events/${event.id}/attendance`}>
                            👥 View Attendance
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {events.filter((event) => {
              const eventDate = new Date(event.date)
              const now = new Date()
              if (activeTab === 'upcoming') {
                return eventDate >= now
              } else {
                return eventDate < now
              }
            }).length === 0 && (
              <Card className="shadow-sm">
                <CardContent className="p-8 text-center">
                  <p className="text-lg font-medium text-muted-foreground">
                    {activeTab === 'upcoming' 
                      ? 'No upcoming events. Create your first event!'
                      : 'No past events yet.'}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Create Event Modal */}
        {showCreateForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 my-4 sm:my-8 mt-4 sm:mt-8">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Create New Event</h3>

              <form onSubmit={handleCreateEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Theme (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.theme}
                    onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                    placeholder="e.g., Networking, Workshop, Social, etc."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rating
                  </label>
                  <select
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="18+">18+</option>
                    <option value="All Ages">All Ages</option>
                    <option value="16+">16+</option>
                    <option value="13+">13+</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rating
                  </label>
                  <select
                    value={formData.rating}
                    onChange={(e) => setFormData({ ...formData, rating: e.target.value })}
                    className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="18+">18+</option>
                    <option value="All Ages">All Ages</option>
                    <option value="16+">16+</option>
                    <option value="13+">13+</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => {
                      const nextDate = e.target.value
                      const durationMinutes = hoursToMinutes(formData.duration_hours)
                      const nextEndTime = computeEndTime(nextDate, durationMinutes)
                      setFormData({ ...formData, date: nextDate, end_time: nextEndTime })
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duration (hours)
                    </label>
                    <select
                      value={formData.duration_hours}
                      onChange={(e) => {
                        const nextDuration = e.target.value
                        const durationMinutes = hoursToMinutes(nextDuration)
                        const nextEndTime = computeEndTime(formData.date, durationMinutes)
                        setFormData({ ...formData, duration_hours: nextDuration, end_time: nextEndTime })
                      }}
                      className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((hours) => (
                        <option key={hours} value={hours.toString()}>{hours} hr</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.end_time}
                      onChange={(e) => {
                        const nextEnd = e.target.value
                        const nextDuration = computeDurationMinutes(formData.date, nextEnd)
                        setFormData({
                          ...formData,
                          end_time: nextEnd,
                          duration_hours: nextDuration ? minutesToHoursString(nextDuration) : formData.duration_hours,
                        })
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="create-venue">Venue *</Label>
                  <select
                    id="create-venue"
                    value={formData.venue_id}
                    onChange={(e) => setFormData({ ...formData, venue_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="">Select a venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name} - {venue.address}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Credits Required *
                    </label>
                    <input
                      type="number"
                      value={formData.credits_required}
                      onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                      min="1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Attendees
                    </label>
                    <input
                      type="number"
                      value={formData.max_attendees}
                      onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                      min="1"
                      placeholder="Unlimited"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cancel Hours *
                    </label>
                    <input
                      type="number"
                      value={formData.cancellation_hours}
                      onChange={(e) => setFormData({ ...formData, cancellation_hours: e.target.value })}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Hours before event to allow cancellation with refund</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.open_registration_now}
                        onChange={(e) => setFormData({ ...formData, open_registration_now: e.target.checked })}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Open Registration Now
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 ml-6 mt-1">
                      If unchecked, registration will open at a specific date/time
                    </p>
                  </div>

                  {!formData.open_registration_now && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Registration Opens At *
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.registration_opens_at}
                        onChange={(e) => setFormData({ ...formData, registration_opens_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required={!formData.open_registration_now}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                  >
                    {submitting ? 'Creating...' : 'Create Event'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false)
                      resetFormData()
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Event Modal */}
        {showEditForm && editingEvent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start sm:items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 my-4 sm:my-8 mt-4 sm:mt-8">
              <h3 className="text-xl font-bold mb-4 text-gray-900">Edit Event</h3>

              <form onSubmit={handleUpdateEvent} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Event Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description *
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={3}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Theme (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.theme}
                    onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                    placeholder="e.g., Networking, Workshop, Social, etc."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date & Time *
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.date}
                    onChange={(e) => {
                      const nextDate = e.target.value
                      const durationMinutes = hoursToMinutes(formData.duration_hours)
                      const nextEndTime = computeEndTime(nextDate, durationMinutes)
                      setFormData({ ...formData, date: nextDate, end_time: nextEndTime })
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Duration (hours)
                    </label>
                    <select
                      value={formData.duration_hours}
                      onChange={(e) => {
                        const nextDuration = e.target.value
                        const durationMinutes = hoursToMinutes(nextDuration)
                        const nextEndTime = computeEndTime(formData.date, durationMinutes)
                        setFormData({ ...formData, duration_hours: nextDuration, end_time: nextEndTime })
                      }}
                      className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      {[0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((hours) => (
                        <option key={hours} value={hours.toString()}>{hours} hr</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.end_time}
                      onChange={(e) => {
                        const nextEnd = e.target.value
                        const nextDuration = computeDurationMinutes(formData.date, nextEnd)
                        setFormData({
                          ...formData,
                          end_time: nextEnd,
                          duration_hours: nextDuration ? minutesToHoursString(nextDuration) : formData.duration_hours,
                        })
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="create-venue">Venue *</Label>
                  <select
                    id="create-venue"
                    value={formData.venue_id}
                    onChange={(e) => setFormData({ ...formData, venue_id: e.target.value })}
                    className="w-full px-4 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    required
                  >
                    <option value="">Select a venue</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name} - {venue.address}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Credits Required *
                    </label>
                    <input
                      type="number"
                      value={formData.credits_required}
                      onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                      min="1"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Max Attendees
                    </label>
                    <input
                      type="number"
                      value={formData.max_attendees}
                      onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                      min="1"
                      placeholder="Unlimited"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cancel Hours *
                    </label>
                    <input
                      type="number"
                      value={formData.cancellation_hours}
                      onChange={(e) => setFormData({ ...formData, cancellation_hours: e.target.value })}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">Hours before event to allow cancellation with refund</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="mb-4">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.open_registration_now}
                        onChange={(e) => setFormData({ ...formData, open_registration_now: e.target.checked })}
                        className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Open Registration Now
                      </span>
                    </label>
                    <p className="text-xs text-gray-500 ml-6 mt-1">
                      If unchecked, registration will open at a specific date/time
                    </p>
                  </div>

                  {!formData.open_registration_now && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Registration Opens At *
                      </label>
                      <input
                        type="datetime-local"
                        value={formData.registration_opens_at}
                        onChange={(e) => setFormData({ ...formData, registration_opens_at: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required={!formData.open_registration_now}
                      />
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 font-medium"
                  >
                    {submitting ? 'Updating...' : 'Update Event'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowEditForm(false)
                      setEditingEvent(null)
                      resetFormData()
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
