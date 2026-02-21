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
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { QrCode, Link as LinkIcon, Edit, Users, Image as ImageIcon, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type Venue = {
  id: string
  name: string
  address: string
}

const MAX_POSTER_BYTES = 10 * 1024 * 1024

export default function AdminEventsPage() {
  const { confirm } = useConfirmDialog()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [venues, setVenues] = useState<Venue[]>([])
  const [createStep, setCreateStep] = useState<'details' | 'tickets'>('details')
  const [posterUploadingId, setPosterUploadingId] = useState<string | null>(null)
  const [posterJobSummary, setPosterJobSummary] = useState<Record<string, { posted: number; failed: number; pending: number; skipped: number }>>({})
  const [posterPublishMeta, setPosterPublishMeta] = useState<Record<string, { count: number; lastPublishedAt: string | null }>>({})
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    theme: '',
    rating: '18+',
    event_type: 'open_mic',
    tickets_enabled: false,
    external_event: false,
    external_ticket_url: '',
    ticket_price: '',
    ticket_quantity: '',
    date: '',
    end_time: '',
    duration_hours: '2',
    venue_id: '',
    credits_required: '5',
    food_coupon_enabled: false,
    spot_fee_credits: '5',
    food_coupon_value_cents: '500',
    food_coupon_expires_hours: '24',
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
      await loadPosterJobSummary((data || []).map((item: any) => item.id))
      await loadPosterPublishMeta((data || []).map((item: any) => item.id))
    }
    setLoading(false)
  }

  async function loadPosterJobSummary(eventIds: string[]) {
    if (eventIds.length === 0) {
      setPosterJobSummary({})
      return
    }
    const { data } = await supabase
      .from('social_post_jobs')
      .select('event_id, status')
      .in('event_id', eventIds)
      .order('created_at', { ascending: false })

    const summary: Record<string, { posted: number; failed: number; pending: number; skipped: number }> = {}
    for (const id of eventIds) {
      summary[id] = { posted: 0, failed: 0, pending: 0, skipped: 0 }
    }
    for (const row of data || []) {
      if (!summary[row.event_id]) continue
      if (row.status === 'posted') summary[row.event_id].posted += 1
      if (row.status === 'failed') summary[row.event_id].failed += 1
      if (row.status === 'pending' || row.status === 'processing') summary[row.event_id].pending += 1
      if (row.status === 'skipped') summary[row.event_id].skipped += 1
    }
    setPosterJobSummary(summary)
  }

  async function loadPosterPublishMeta(eventIds: string[]) {
    if (eventIds.length === 0) {
      setPosterPublishMeta({})
      return
    }

    const { data } = await supabase
      .from('poster_publish_history')
      .select('event_id, published_at')
      .in('event_id', eventIds)
      .order('published_at', { ascending: false })

    const meta: Record<string, { count: number; lastPublishedAt: string | null }> = {}
    for (const id of eventIds) {
      meta[id] = { count: 0, lastPublishedAt: null }
    }
    for (const row of data || []) {
      if (!meta[row.event_id]) continue
      meta[row.event_id].count += 1
      if (!meta[row.event_id].lastPublishedAt) {
        meta[row.event_id].lastPublishedAt = row.published_at
      }
    }
    setPosterPublishMeta(meta)
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

      if (formData.tickets_enabled && formData.external_event && !formData.external_ticket_url) {
        alert('Please provide an external ticket link')
        setSubmitting(false)
        return
      }

      if (formData.tickets_enabled && !formData.external_event) {
        const priceValue = parseFloat(formData.ticket_price)
        const quantityValue = parseInt(formData.ticket_quantity)
        if (!Number.isFinite(priceValue) || priceValue <= 0 || !Number.isFinite(quantityValue) || quantityValue <= 0) {
          alert('Please provide a valid ticket price and quantity')
          setSubmitting(false)
          return
        }
      }

      if (formData.tickets_enabled && !formData.external_event) {
        const priceValue = parseFloat(formData.ticket_price)
        const quantityValue = parseInt(formData.ticket_quantity)
        if (!Number.isFinite(priceValue) || priceValue <= 0 || !Number.isFinite(quantityValue) || quantityValue <= 0) {
          alert('Please provide a valid ticket price and quantity')
          setSubmitting(false)
          return
        }
      }

      const durationMinutes = hoursToMinutes(formData.duration_hours)
      const endTimeValue = formData.end_time || computeEndTime(formData.date, durationMinutes)
      const endTimeIso = endTimeValue ? new Date(endTimeValue).toISOString() : null

      const isBookedShow = formData.event_type === 'booked_show'
      const isTicketed = formData.tickets_enabled
      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        event_type: formData.event_type || 'open_mic',
        tickets_enabled: !!formData.tickets_enabled,
        external_event: !!formData.external_event,
        external_ticket_url: formData.tickets_enabled && formData.external_event
          ? formData.external_ticket_url || null
          : null,
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        venue_id: formData.venue_id || null,
        location: location,
        credits_required: isBookedShow || isTicketed ? 0 : parseInt(formData.credits_required),
        food_coupon_enabled: !isBookedShow && !isTicketed && !!formData.food_coupon_enabled,
        spot_fee_credits: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.spot_fee_credits || '0') : 0,
        food_coupon_value_cents: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.food_coupon_value_cents || '0') : 0,
        food_coupon_expires_hours: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.food_coupon_expires_hours || '24') : 24,
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        cancellation_hours: isBookedShow || isTicketed ? 0 : parseInt(formData.cancellation_hours),
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

      if (formData.tickets_enabled && !formData.external_event) {
        const ticketPrice = Math.round(parseFloat(formData.ticket_price) * 100)
        const ticketQuantity = parseInt(formData.ticket_quantity)
        await supabase.from('event_tickets').insert({
          event_id: data.id,
          name: 'General Admission',
          price_cents: ticketPrice,
          quantity: ticketQuantity,
          sold: 0,
        })
      }

      alert('Event created successfully!')
      setShowCreateForm(false)
      setCreateStep('details')
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

    const { data: ticketData } = await supabase
      .from('event_tickets')
      .select('price_cents, quantity')
      .eq('event_id', event.id)
      .maybeSingle()

    setFormData({
      title: event.title,
      description: event.description || '',
      theme: event.theme || '',
      rating: (event as any).rating || '18+',
      event_type: (event as any).event_type || 'open_mic',
      tickets_enabled: !!(event as any).tickets_enabled,
      external_event: !!(event as any).external_event,
      external_ticket_url: (event as any).external_ticket_url || '',
      ticket_price: ticketData ? (ticketData.price_cents / 100).toFixed(2) : '',
      ticket_quantity: ticketData ? ticketData.quantity.toString() : '',
      date: localDateTime,
      end_time: endTimeValue,
      duration_hours: minutesToHoursString(durationMinutes),
      venue_id: venueId,
      credits_required: event.credits_required.toString(),
      food_coupon_enabled: !!(event as any).food_coupon_enabled,
      spot_fee_credits: ((event as any).spot_fee_credits ?? 5).toString(),
      food_coupon_value_cents: ((event as any).food_coupon_value_cents ?? 500).toString(),
      food_coupon_expires_hours: ((event as any).food_coupon_expires_hours ?? 24).toString(),
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

      const isBookedShow = formData.event_type === 'booked_show'
      const isTicketed = formData.tickets_enabled
      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        event_type: formData.event_type || 'open_mic',
        tickets_enabled: !!formData.tickets_enabled,
        external_event: !!formData.external_event,
        external_ticket_url: formData.tickets_enabled && formData.external_event
          ? formData.external_ticket_url || null
          : null,
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        location: locationValue,
        credits_required: isBookedShow || isTicketed ? 0 : parseInt(formData.credits_required),
        food_coupon_enabled: !isBookedShow && !isTicketed && !!formData.food_coupon_enabled,
        spot_fee_credits: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.spot_fee_credits || '0') : 0,
        food_coupon_value_cents: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.food_coupon_value_cents || '0') : 0,
        food_coupon_expires_hours: !isBookedShow && !isTicketed && formData.food_coupon_enabled ? parseInt(formData.food_coupon_expires_hours || '24') : 24,
        max_attendees: nextMax,
        cancellation_hours: isBookedShow || isTicketed ? 0 : parseInt(formData.cancellation_hours),
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

      if (formData.tickets_enabled && !formData.external_event) {
        const ticketPrice = Math.round(parseFloat(formData.ticket_price) * 100)
        const ticketQuantity = parseInt(formData.ticket_quantity)
        await supabase.from('event_tickets').upsert({
          event_id: editingEvent.id,
          name: 'General Admission',
          price_cents: ticketPrice,
          quantity: ticketQuantity,
        })
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
      event_type: 'open_mic',
      tickets_enabled: false,
      external_event: false,
      external_ticket_url: '',
      ticket_price: '',
      ticket_quantity: '',
      date: '',
      end_time: '',
      duration_hours: '2',
      venue_id: '',
      credits_required: '5',
      food_coupon_enabled: false,
      spot_fee_credits: '5',
      food_coupon_value_cents: '500',
      food_coupon_expires_hours: '24',
      max_attendees: '',
      cancellation_hours: '4',
      open_registration_now: true,
      registration_opens_at: ''
    })
  }

  async function handleCancelEvent(eventId: string, eventTitle: string) {
    const shouldProceed = await confirm({
      title: 'Cancel event?',
      message: `Cancel "${eventTitle}" and refund all attendees? This cannot be undone.`,
      confirmText: 'Yes, cancel event',
      cancelText: 'Keep event',
      variant: 'destructive',
    })
    if (!shouldProceed) {
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

  async function handlePosterUpload(eventId: string, file: File) {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }
    if (file.size > MAX_POSTER_BYTES) {
      alert('Poster file must be 10MB or smaller')
      return
    }
    setPosterUploadingId(eventId)
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${eventId}/${Date.now()}-${cleanName}`
      const { error: uploadError } = await supabase.storage
        .from('event-posters')
        .upload(path, file, { upsert: false, cacheControl: '3600' })
      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = supabase.storage.from('event-posters').getPublicUrl(path)

      const caption = window.prompt('Poster caption (optional):') || null
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const response = await fetch('/api/posters/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId, action: 'set', posterUrl: publicUrl, posterCaption: caption }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to save poster')
      alert(`Poster saved. Queued ${result.jobs?.jobsQueued || 0} auto-post job(s).`)
      await loadEvents()
    } catch (error: any) {
      alert(error.message || 'Failed to upload poster')
    } finally {
      setPosterUploadingId(null)
    }
  }

  async function handlePosterRemove(eventId: string) {
    const shouldProceed = await confirm({
      title: 'Remove poster?',
      message: 'Remove this event poster?',
      confirmText: 'Remove',
      cancelText: 'Keep',
      variant: 'destructive',
    })
    if (!shouldProceed) return
    setPosterUploadingId(eventId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')
      const response = await fetch('/api/posters/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ eventId, action: 'remove' }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to remove poster')
      await loadEvents()
    } catch (error: any) {
      alert(error.message || 'Failed to remove poster')
    } finally {
      setPosterUploadingId(null)
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
        <Button onClick={() => {
          setCreateStep('details')
          setShowCreateForm(true)
        }}>
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
                {event.event_type === 'booked_show' ? (
                  <p>Invite only</p>
                ) : (
                  <p>{event.credits_required} credits</p>
                )}
                {event.max_attendees && <p>Max {event.max_attendees} attendees</p>}
                {event.event_type !== 'booked_show' && (
                  <p>Cancel up to {event.cancellation_hours || 4} hours before</p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handlePosterUpload(event.id, file)
                      e.currentTarget.value = ''
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-sky-50 hover:bg-sky-100 border-sky-200 text-sky-700"
                    disabled={posterUploadingId === event.id}
                    asChild
                  >
                    <span>{posterUploadingId === event.id ? 'Saving...' : event.poster_url ? 'Update Poster' : 'Add Poster'}</span>
                  </Button>
                </label>
                {event.poster_url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-700"
                    onClick={() => handlePosterRemove(event.id)}
                    disabled={posterUploadingId === event.id}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
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
              {event.poster_url && (
                <div className="text-xs text-sky-700 mt-2 space-y-1">
                  <div className="flex items-center gap-1">
                    <ImageIcon className="w-3.5 h-3.5" />
                    Poster published
                  </div>
                  <div className="text-muted-foreground">
                    Posted: {posterJobSummary[event.id]?.posted || 0} | Pending: {posterJobSummary[event.id]?.pending || 0} | Failed: {posterJobSummary[event.id]?.failed || 0}
                  </div>
                  <div className="text-muted-foreground">
                    Publishes: {posterPublishMeta[event.id]?.count || 0}
                    {posterPublishMeta[event.id]?.lastPublishedAt
                      ? ` | Last: ${new Date(posterPublishMeta[event.id].lastPublishedAt as string).toLocaleString()}`
                      : ''}
                  </div>
                </div>
              )}
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
              <Label>Event Type</Label>
              <div className="flex items-center gap-4">
                {[
                  { value: 'open_mic', label: 'Open Mic' },
                  { value: 'booked_show', label: 'Booked Show' },
                ].map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="radio"
                      name="edit-event-type"
                      value={option.value}
                      checked={formData.event_type === option.value}
                        onChange={(e) => {
                          const nextType = e.target.value
                          setFormData({
                            ...formData,
                            event_type: nextType,
                            credits_required: nextType === 'booked_show' ? '0' : formData.credits_required || '5',
                            cancellation_hours: nextType === 'booked_show' ? '0' : formData.cancellation_hours || '4',
                          })
                        }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
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
                  min="0"
                disabled={formData.event_type === 'booked_show' || formData.tickets_enabled}
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
                disabled={formData.event_type === 'booked_show' || formData.tickets_enabled}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.event_type === 'booked_show'
                    ? 'Not applicable for booked shows'
                    : formData.tickets_enabled
                      ? 'Not applicable for ticketed events'
                      : 'Hours before event to allow cancellation with refund'}
                </p>
              </div>
            </div>

            {formData.event_type === 'open_mic' && !formData.tickets_enabled && (
              <div className="border-t pt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formData.food_coupon_enabled}
                    onChange={(e) => setFormData({ ...formData, food_coupon_enabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  Enable venue food coupon
                </label>
                {formData.food_coupon_enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Spot fee credits</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.spot_fee_credits}
                        onChange={(e) => setFormData({ ...formData, spot_fee_credits: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Coupon value (cents)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.food_coupon_value_cents}
                        onChange={(e) => setFormData({ ...formData, food_coupon_value_cents: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Coupon expiry (hours)</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.food_coupon_expires_hours}
                        onChange={(e) => setFormData({ ...formData, food_coupon_expires_hours: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.event_type !== 'booked_show' && (
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
            )}

            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-semibold">Tickets</Label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formData.tickets_enabled}
                  onChange={(e) => setFormData({ ...formData, tickets_enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                Add tickets
              </label>

              {formData.tickets_enabled && (
                <>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={formData.external_event}
                      onChange={(e) => setFormData({ ...formData, external_event: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    External event
                  </label>

                  <div>
                    <Label htmlFor="edit-external-link">External ticket link</Label>
                    <Input
                      id="edit-external-link"
                      type="url"
                      value={formData.external_ticket_url}
                      onChange={(e) => setFormData({ ...formData, external_ticket_url: e.target.value })}
                      disabled={!formData.external_event}
                      placeholder="https://tickets.example.com"
                    />
                  </div>

                  {!formData.external_event && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-ticket-price">Ticket price (CAD)</Label>
                        <Input
                          id="edit-ticket-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.ticket_price}
                          onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                          placeholder="20.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit-ticket-quantity">Ticket quantity</Label>
                        <Input
                          id="edit-ticket-quantity"
                          type="number"
                          min="1"
                          value={formData.ticket_quantity}
                          onChange={(e) => setFormData({ ...formData, ticket_quantity: e.target.value })}
                          placeholder="100"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-semibold">Tickets</Label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formData.tickets_enabled}
                  onChange={(e) => {
                    const nextValue = e.target.checked
                    setFormData({
                      ...formData,
                      tickets_enabled: nextValue,
                      credits_required: nextValue ? '0' : formData.credits_required || '5',
                      cancellation_hours: nextValue ? '0' : formData.cancellation_hours || '4',
                      external_event: nextValue ? formData.external_event : false,
                      external_ticket_url: nextValue ? formData.external_ticket_url : '',
                    })
                  }}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                Add tickets
              </label>

              {formData.tickets_enabled && (
                <>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={formData.external_event}
                      onChange={(e) => setFormData({ ...formData, external_event: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    External event
                  </label>

                  <div>
                    <Label htmlFor="create-external-link">External ticket link</Label>
                    <Input
                      id="create-external-link"
                      type="url"
                      value={formData.external_ticket_url}
                      onChange={(e) => setFormData({ ...formData, external_ticket_url: e.target.value })}
                      disabled={!formData.external_event}
                      placeholder="https://tickets.example.com"
                    />
                  </div>

                  {!formData.external_event && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="create-ticket-price">Ticket price (CAD)</Label>
                        <Input
                          id="create-ticket-price"
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.ticket_price}
                          onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                          placeholder="20.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="create-ticket-quantity">Ticket quantity</Label>
                        <Input
                          id="create-ticket-quantity"
                          type="number"
                          min="1"
                          value={formData.ticket_quantity}
                          onChange={(e) => setFormData({ ...formData, ticket_quantity: e.target.value })}
                          placeholder="100"
                        />
                      </div>
                    </div>
                  )}
                </>
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
          setCreateStep('details')
          resetFormData()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>Create a new event for users to book</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateEvent} className="space-y-4">
            {createStep === 'details' && (
              <>
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
              <Label>Event Type</Label>
              <div className="flex items-center gap-4">
                {[
                  { value: 'open_mic', label: 'Open Mic' },
                  { value: 'booked_show', label: 'Booked Show' },
                ].map((option) => (
                  <label key={option.value} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="radio"
                      name="create-event-type"
                      value={option.value}
                      checked={formData.event_type === option.value}
                        onChange={(e) => {
                          const nextType = e.target.value
                          setFormData({
                            ...formData,
                            event_type: nextType,
                            credits_required: nextType === 'booked_show' ? '0' : formData.credits_required || '5',
                            cancellation_hours: nextType === 'booked_show' ? '0' : formData.cancellation_hours || '4',
                          })
                        }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <Label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={formData.tickets_enabled}
                  onChange={(e) => setFormData({ ...formData, tickets_enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                />
                Add tickets
              </Label>
              {formData.tickets_enabled && (
                <Button type="button" size="sm" variant="outline" onClick={() => setCreateStep('tickets')}>
                  Configure tickets
                </Button>
              )}
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
                  min="0"
                disabled={formData.event_type === 'booked_show' || formData.tickets_enabled}
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
                disabled={formData.event_type === 'booked_show' || formData.tickets_enabled}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {formData.event_type === 'booked_show'
                    ? 'Not applicable for booked shows'
                    : formData.tickets_enabled
                      ? 'Not applicable for ticketed events'
                      : 'Hours before event to allow cancellation with refund'}
                </p>
              </div>
            </div>

            {formData.event_type === 'open_mic' && !formData.tickets_enabled && (
              <div className="border-t pt-4 space-y-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formData.food_coupon_enabled}
                    onChange={(e) => setFormData({ ...formData, food_coupon_enabled: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  Enable venue food coupon
                </label>
                {formData.food_coupon_enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <Label>Spot fee credits</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.spot_fee_credits}
                        onChange={(e) => setFormData({ ...formData, spot_fee_credits: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Coupon value (cents)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.food_coupon_value_cents}
                        onChange={(e) => setFormData({ ...formData, food_coupon_value_cents: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Coupon expiry (hours)</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.food_coupon_expires_hours}
                        onChange={(e) => setFormData({ ...formData, food_coupon_expires_hours: e.target.value })}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {formData.event_type !== 'booked_show' && (
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
            )}
            </>
            )}

            {createStep === 'tickets' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-semibold">Ticket Settings</h4>
                  <Button type="button" variant="outline" size="sm" onClick={() => setCreateStep('details')}>
                    Back
                  </Button>
                </div>

                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={formData.external_event}
                    onChange={(e) => setFormData({ ...formData, external_event: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  External event
                </label>

                <div>
                  <Label htmlFor="create-external-link">External ticket link</Label>
                  <Input
                    id="create-external-link"
                    type="url"
                    value={formData.external_ticket_url}
                    onChange={(e) => setFormData({ ...formData, external_ticket_url: e.target.value })}
                    disabled={!formData.external_event}
                    placeholder="https://tickets.example.com"
                  />
                </div>

                {!formData.external_event && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="create-ticket-price">Ticket price (CAD)</Label>
                      <Input
                        id="create-ticket-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.ticket_price}
                        onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                        placeholder="20.00"
                      />
                    </div>
                    <div>
                      <Label htmlFor="create-ticket-quantity">Ticket quantity</Label>
                      <Input
                        id="create-ticket-quantity"
                        type="number"
                        min="1"
                        value={formData.ticket_quantity}
                        onChange={(e) => setFormData({ ...formData, ticket_quantity: e.target.value })}
                        placeholder="100"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

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
                  setCreateStep('details')
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