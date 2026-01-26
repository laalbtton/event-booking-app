'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Trash2, Edit, MapPin, Car, Accessibility, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

type Venue = {
  id: string
  name: string
  address: string
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  created_at: string
  updated_at: string
}

export default function AdminVenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [submitting, setSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    parking_options: '',
    accessibility: '',
    food_drinks_available: false
  })

  useEffect(() => {
    loadVenues()
  }, [])

  async function loadVenues() {
    setLoading(true)
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true })

    if (!error && data) {
      setVenues(data)
    }
    setLoading(false)
  }

  function resetFormData() {
    setFormData({
      name: '',
      address: '',
      parking_options: '',
      accessibility: '',
      food_drinks_available: false
    })
  }

  async function handleCreateVenue(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const venueData = {
        name: formData.name,
        address: formData.address,
        parking_options: formData.parking_options || null,
        accessibility: formData.accessibility || null,
        food_drinks_available: formData.food_drinks_available,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('venues')
        .insert(venueData)

      if (error) throw error

      alert('Venue created successfully!')
      setShowCreateForm(false)
      resetFormData()
      loadVenues()
    } catch (error: any) {
      console.error('Error creating venue:', error)
      alert('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditVenue(venue: Venue) {
    setEditingVenue(venue)
    setFormData({
      name: venue.name,
      address: venue.address,
      parking_options: venue.parking_options || '',
      accessibility: venue.accessibility || '',
      food_drinks_available: venue.food_drinks_available
    })
    setShowEditForm(true)
  }

  async function handleUpdateVenue(e: React.FormEvent) {
    e.preventDefault()
    if (!editingVenue) return

    setSubmitting(true)

    try {
      const venueData = {
        name: formData.name,
        address: formData.address,
        parking_options: formData.parking_options || null,
        accessibility: formData.accessibility || null,
        food_drinks_available: formData.food_drinks_available,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('venues')
        .update(venueData)
        .eq('id', editingVenue.id)

      if (error) throw error

      alert('Venue updated successfully!')
      setShowEditForm(false)
      setEditingVenue(null)
      resetFormData()
      loadVenues()
    } catch (error: any) {
      console.error('Error updating venue:', error)
      alert('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteVenue(venueId: string, venueName: string) {
    if (!confirm(`Are you sure you want to delete "${venueName}"? This will remove the venue from all events that use it.`)) {
      return
    }

    try {
      // First, remove venue_id from events that use this venue
      await supabase
        .from('events')
        .update({ venue_id: null })
        .eq('venue_id', venueId)

      // Then delete the venue
      const { error } = await supabase
        .from('venues')
        .delete()
        .eq('id', venueId)

      if (error) throw error

      alert('Venue deleted successfully!')
      loadVenues()
    } catch (error: any) {
      console.error('Error deleting venue:', error)
      alert('Error: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex justify-end mb-6">
        <Button onClick={() => setShowCreateForm(true)}>
          + Add Venue
        </Button>
      </div>

      {/* Venues Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <Card key={venue.id}>
            <CardHeader>
              <CardTitle className="text-lg">{venue.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 mb-4">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <p className="text-sm text-muted-foreground">{venue.address}</p>
                </div>
                
                {venue.parking_options && (
                  <div className="flex items-start gap-2">
                    <Car className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">{venue.parking_options}</p>
                  </div>
                )}
                
                {venue.accessibility && (
                  <div className="flex items-start gap-2">
                    <Accessibility className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <p className="text-sm text-muted-foreground">{venue.accessibility}</p>
                  </div>
                )}
                
                {venue.food_drinks_available && (
                  <div className="flex items-center gap-2">
                    <UtensilsCrossed className="w-4 h-4 text-muted-foreground" />
                    <Badge variant="secondary">Food & Drinks Available</Badge>
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => handleEditVenue(venue)}
                  variant="default"
                  size="sm"
                  className="flex-1"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  onClick={() => handleDeleteVenue(venue.id, venue.name)}
                  variant="destructive"
                  size="sm"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {venues.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No venues yet. Add your first venue!
          </CardContent>
        </Card>
      )}

      {/* Create Venue Dialog */}
      <Dialog open={showCreateForm} onOpenChange={(open) => {
        if (!open) {
          setShowCreateForm(false)
          resetFormData()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Venue</DialogTitle>
            <DialogDescription>Add a new approved venue to the list</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateVenue} className="space-y-4">
            <div>
              <Label htmlFor="create-name">Venue Name *</Label>
              <Input
                id="create-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Downtown Community Center"
                required
              />
            </div>

            <div>
              <Label htmlFor="create-address">Address *</Label>
              <Input
                id="create-address"
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="e.g., 123 Main St, City, State 12345"
                required
              />
            </div>

            <div>
              <Label htmlFor="create-parking">Parking Options (Optional)</Label>
              <Input
                id="create-parking"
                type="text"
                value={formData.parking_options}
                onChange={(e) => setFormData({ ...formData, parking_options: e.target.value })}
                placeholder="e.g., Free parking, Paid parking, Street parking, No parking"
              />
            </div>

            <div>
              <Label htmlFor="create-accessibility">Accessibility (Optional)</Label>
              <Input
                id="create-accessibility"
                type="text"
                value={formData.accessibility}
                onChange={(e) => setFormData({ ...formData, accessibility: e.target.value })}
                placeholder="e.g., Wheelchair accessible, Elevator access, Accessible restrooms"
              />
            </div>

            <div>
              <Label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.food_drinks_available}
                  onChange={(e) => setFormData({ ...formData, food_drinks_available: e.target.checked })}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm font-medium">
                  Food & Drinks Available
                </span>
              </Label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Creating...' : 'Create Venue'}
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

      {/* Edit Venue Dialog */}
      <Dialog open={showEditForm} onOpenChange={(open) => {
        if (!open) {
          setShowEditForm(false)
          setEditingVenue(null)
          resetFormData()
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Venue</DialogTitle>
            <DialogDescription>Update venue details</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateVenue} className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Venue Name *</Label>
              <Input
                id="edit-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-address">Address *</Label>
              <Input
                id="edit-address"
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                required
              />
            </div>

            <div>
              <Label htmlFor="edit-parking">Parking Options (Optional)</Label>
              <Input
                id="edit-parking"
                type="text"
                value={formData.parking_options}
                onChange={(e) => setFormData({ ...formData, parking_options: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="edit-accessibility">Accessibility (Optional)</Label>
              <Input
                id="edit-accessibility"
                type="text"
                value={formData.accessibility}
                onChange={(e) => setFormData({ ...formData, accessibility: e.target.value })}
              />
            </div>

            <div>
              <Label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.food_drinks_available}
                  onChange={(e) => setFormData({ ...formData, food_drinks_available: e.target.checked })}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm font-medium">
                  Food & Drinks Available
                </span>
              </Label>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? 'Updating...' : 'Update Venue'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowEditForm(false)
                  setEditingVenue(null)
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
