'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Event } from '@/lib/supabase'
import Link from 'next/link'

export default function AdminEventsPage() {
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    theme: '',
    date: '',
    location: '',
    credits_required: '5',
    max_attendees: '',
    cancellation_hours: '4',
    open_registration_now: true,
    registration_opens_at: ''
  })

  useEffect(() => {
    loadEvents()
  }, [])

  async function loadEvents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('events')
      .select('*')
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
      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        date: new Date(formData.date).toISOString(),
        location: formData.location,
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
    const localDateTime = new Date(eventDate.getTime() - eventDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    
    const regOpensAt = event.registration_opens_at
      ? new Date(new Date(event.registration_opens_at).getTime() - new Date(event.registration_opens_at).getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16)
      : ''

    setFormData({
      title: event.title,
      description: event.description || '',
      theme: event.theme || '',
      date: localDateTime,
      location: event.location || '',
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
      const eventData = {
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        date: new Date(formData.date).toISOString(),
        location: formData.location,
        credits_required: parseInt(formData.credits_required),
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
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
      date: '',
      location: '',
      credits_required: '5',
      max_attendees: '',
      cancellation_hours: '4',
      open_registration_now: true,
      registration_opens_at: ''
    })
  }

  async function handleDeleteEvent(eventId: string, eventTitle: string) {
    if (!confirm(`Are you sure you want to delete "${eventTitle}"?`)) {
      return
    }

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

      if (error) throw error

      alert('Event deleted successfully!')
      loadEvents()
    } catch (error: any) {
      console.error('Error deleting event:', error)
      alert('Error: ' + error.message)
    }
  }

  if (loading) {
    return <div className="text-center py-8">Loading events...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-gray-900">Event Management</h2>
        <button
          onClick={() => setShowCreateForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 font-medium"
        >
          + Create Event
        </button>
      </div>

      {/* Events Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {events.map((event) => (
          <div key={event.id} className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold text-lg mb-2">{event.title}</h3>
            <p className="text-gray-600 text-sm mb-4">{event.description}</p>
            
            <div className="text-sm text-gray-500 mb-4 space-y-1">
              <p>📅 {new Date(event.date).toLocaleString()}</p>
              <p>📍 {event.location}</p>
              {event.theme && <p>🎨 Theme: {event.theme}</p>}
              <p>💳 {event.credits_required} credits</p>
              {event.max_attendees && <p>👥 Max {event.max_attendees} attendees</p>}
              <p>⏱️ Cancel up to {event.cancellation_hours || 4} hours before</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleEditEvent(event)}
                  className="flex-1 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-sm font-medium"
                  title="Edit Event"
                >
                  ✏️ Edit Details
                </button>
                
                <button
                  onClick={() => handleDeleteEvent(event.id, event.title)}
                  className="bg-red-600 text-white px-3 py-2 rounded hover:bg-red-700 text-sm font-medium"
                  title="Delete Event"
                >
                  🗑️
                </button>

                <button
                  onClick={() => {
                    const publicUrl = `${window.location.origin}/event-public/${event.id}`
                    navigator.clipboard.writeText(publicUrl)
                    alert('Public link copied!')
                  }}
                  className="bg-green-600 text-white px-3 py-2 rounded hover:bg-green-700"
                  title="Copy Public Link"
                >
                  ⎘
                </button>

                <Link
                  href={`/admin/events/${event.id}/qr`}
                  className="bg-purple-600 text-white px-3 py-2 rounded hover:bg-purple-700 text-center"
                  title="Generate QR Code"
                >
                  ▦
                </Link>

                <Link
                  href={`/admin/events/${event.id}/attendance`}
                  className="bg-orange-600 text-white px-3 py-2 rounded hover:bg-orange-700 text-center"
                  title="Manage Attendance"
                >
                  👥
                </Link>
              </div>


          </div>
        ))}
      </div>

      {events.length === 0 && (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          No events yet. Create your first event!
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
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Online, Downtown Office, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
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
                  Date & Time *
                </label>
                <input
                  type="datetime-local"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location *
                </label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g., Online, Downtown Office, etc."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
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
    </div>
  )
}