'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { QrCode, Link as LinkIcon, Edit, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

type Venue = {
  id: string
  name: string
  address: string
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [venues, setVenues] = useState<Venue[]>([])
  
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
    loadEvents()
    loadVenues()
  }, [])

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

  async function loadEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*, venue_id')
      .order('date', { ascending: true })

    if (!error && data) {
      setEvents(data)
    }
    setLoading(false)
  }

  async function handleCreateEvent(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
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
            : null
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

  function handleEditEvent(event: Event) {
    setEditingEvent(event)
    // Convert ISO date to datetime-local format
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

      const previousMax = editingEvent.max_attendees ?? null
      const nextMax = formData.max_attendees ? parseInt(formData.max_attendees) : null

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
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Event Management</h2>
        <Button onClick={() => setShowCreateForm(true)}>
          + Create Event
        </Button>
      </div>

      {/* Events Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <Card key={event.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">{event.title}</CardTitle>
                {event.status === 'cancelled' && (
                  <Badge variant="destructive">Cancelled</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{event.description}</p>
              
              <div className="text-sm text-muted-foreground mb-4 space-y-1">
                <p>{formatDateTime(event.date)}</p>
                <p>{event.location}</p>
                {event.theme && <p>Theme: {event.theme}</p>}
                <p>Rating: {event.rating || '18+'}</p>
                <p>{event.credits_required} credits</p>
                {event.max_attendees && <p>Max {event.max_attendees} attendees</p>}
                <p>Cancel up to {event.cancellation_hours || 4} hours before</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => handleEditEvent(event)}
                  variant="default"
                  size="sm"
                  className="flex-1"
                  disabled={event.status === 'cancelled'}
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                
                <Button
                  onClick={() => handleCancelEvent(event.id, event.title)}
                  variant="destructive"
                  size="sm"
                  disabled={event.status === 'cancelled'}
                >
                  Cancel
                </Button>

                <Button
                  onClick={() => {
                    const publicUrl = `${window.location.origin}/event-public/${event.id}`
                    navigator.clipboard.writeText(publicUrl)
                    alert('Public link copied!')
                  }}
                  variant="outline"
                  size="sm"
                  className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                >
                  <LinkIcon className="w-4 h-4" />
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="bg-purple-50 hover:bg-purple-100 border-purple-200 text-purple-700"
                >
                  <Link href={`/admin/events/${event.id}/qr`}>
                    <QrCode className="w-4 h-4" />
                  </Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="bg-orange-50 hover:bg-orange-100 border-orange-200 text-orange-700"
                >
                  <Link href={`/admin/events/${event.id}/attendance`}>
                    <Users className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {events.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No events yet. Create your first event!
          </CardContent>
        </Card>
      )}

      {/* Edit Event Dialog */}
      <Dialog open={showEditForm} onOpenChange={(open) => {
        if (!open) {
          setShowEditForm(false)
          setEditingEvent(null)
          resetFormData()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
            <DialogDescription>Update event details</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateEvent} className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Event Title *</Label>
              <Input
                id="edit-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Description *</Label>
              <Textarea
                id="edit-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-theme">Theme (Optional)</Label>
              <Input
                id="edit-theme"
                type="text"
                value={formData.theme}
                onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                placeholder="e.g., Networking, Workshop, Social, etc."
              />
            </div>

            <div>
              <Label htmlFor="edit-rating">Rating</Label>
              <select
                id="edit-rating"
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
              <Label htmlFor="edit-date">Date & Time *</Label>
              <Input
                id="edit-date"
                type="datetime-local"
                value={formData.date}
                onChange={(e) => {
                  const nextDate = e.target.value
                  const durationMinutes = hoursToMinutes(formData.duration_hours)
                  const nextEndTime = computeEndTime(nextDate, durationMinutes)
                  setFormData({ ...formData, date: nextDate, end_time: nextEndTime })
                }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (hours)</Label>
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
                <Label>End Time</Label>
                <Input
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
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-venue">Venue *</Label>
              <select
                id="edit-venue"
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
                <Label htmlFor="edit-credits">Credits Required *</Label>
                <Input
                  id="edit-credits"
                  type="number"
                  value={formData.credits_required}
                  onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                  min="1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-max">Max Attendees</Label>
                <Input
                  id="edit-max"
                  type="number"
                  value={formData.max_attendees}
                  onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                  min="1"
                  placeholder="Unlimited"
                />
              </div>

              <div>
                <Label htmlFor="edit-cancel">Cancel Hours *</Label>
                <Input
                  id="edit-cancel"
                  type="number"
                  value={formData.cancellation_hours}
                  onChange={(e) => setFormData({ ...formData, cancellation_hours: e.target.value })}
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Hours before event to allow cancellation with refund</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="mb-4">
                <Label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.open_registration_now}
                    onChange={(e) => setFormData({ ...formData, open_registration_now: e.target.checked })}
                    className="mr-2 h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    Open Registration Now
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground ml-6 mt-1">
                  If unchecked, registration will open at a specific date/time
                </p>
              </div>

              {!formData.open_registration_now && (
                <div>
                  <Label htmlFor="edit-reg-opens">Registration Opens At *</Label>
                  <Input
                    id="edit-reg-opens"
                    type="datetime-local"
                    value={formData.registration_opens_at}
                    onChange={(e) => setFormData({ ...formData, registration_opens_at: e.target.value })}
                    required={!formData.open_registration_now}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Updating...' : 'Update Event'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditForm(false)
                  setEditingEvent(null)
                  resetFormData()
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Event Dialog */}
      <Dialog open={showCreateForm} onOpenChange={(open) => {
        if (!open) {
          setShowCreateForm(false)
          resetFormData()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>Create a new event for users to book</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            <div>
              <Label htmlFor="create-title">Event Title *</Label>
              <Input
                id="create-title"
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="create-description">Description *</Label>
              <Textarea
                id="create-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                required
              />
            </div>

            <div>
              <Label htmlFor="create-theme">Theme (Optional)</Label>
              <Input
                id="create-theme"
                type="text"
                value={formData.theme}
                onChange={(e) => setFormData({ ...formData, theme: e.target.value })}
                placeholder="e.g., Networking, Workshop, Social, etc."
              />
            </div>

            <div>
              <Label htmlFor="create-rating">Rating</Label>
              <select
                id="create-rating"
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
              <Label htmlFor="create-date">Date & Time *</Label>
              <Input
                id="create-date"
                type="datetime-local"
                value={formData.date}
                onChange={(e) => {
                  const nextDate = e.target.value
                  const durationMinutes = hoursToMinutes(formData.duration_hours)
                  const nextEndTime = computeEndTime(nextDate, durationMinutes)
                  setFormData({ ...formData, date: nextDate, end_time: nextEndTime })
                }}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Duration (hours)</Label>
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
                <Label>End Time</Label>
                <Input
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
                <Label htmlFor="create-credits">Credits Required *</Label>
                <Input
                  id="create-credits"
                  type="number"
                  value={formData.credits_required}
                  onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                  min="1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="create-max">Max Attendees</Label>
                <Input
                  id="create-max"
                  type="number"
                  value={formData.max_attendees}
                  onChange={(e) => setFormData({ ...formData, max_attendees: e.target.value })}
                  min="1"
                  placeholder="Unlimited"
                />
              </div>

              <div>
                <Label htmlFor="create-cancel">Cancel Hours *</Label>
                <Input
                  id="create-cancel"
                  type="number"
                  value={formData.cancellation_hours}
                  onChange={(e) => setFormData({ ...formData, cancellation_hours: e.target.value })}
                  min="0"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">Hours before event to allow cancellation with refund</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="mb-4">
                <Label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.open_registration_now}
                    onChange={(e) => setFormData({ ...formData, open_registration_now: e.target.checked })}
                    className="mr-2 h-4 w-4"
                  />
                  <span className="text-sm font-medium">
                    Open Registration Now
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground ml-6 mt-1">
                  If unchecked, registration will open at a specific date/time
                </p>
              </div>

              {!formData.open_registration_now && (
                <div>
                  <Label htmlFor="create-reg-opens">Registration Opens At *</Label>
                  <Input
                    id="create-reg-opens"
                    type="datetime-local"
                    value={formData.registration_opens_at}
                    onChange={(e) => setFormData({ ...formData, registration_opens_at: e.target.value })}
                    required={!formData.open_registration_now}
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Creating...' : 'Create Event'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false)
                  resetFormData()
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}