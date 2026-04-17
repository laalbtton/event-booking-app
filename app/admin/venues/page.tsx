'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { Trash2, Edit, MapPin, Car, Accessibility, UtensilsCrossed, Wine, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/dateUtils'
import { toast } from 'sonner'

type Venue = {
  id: string
  name: string
  address: string
  city?: string | null
  region?: string | null
  postal_code?: string | null
  country?: string | null
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  drinks_available?: boolean
  created_at: string
  updated_at: string
}

type VenueStaffAssignment = {
  id: string
  venue_id: string
  user_id: string
  staff_role: 'cashier' | 'manager'
  active: boolean
  profiles: {
    id: string
    full_name: string | null
    email: string
  } | null
}

type EventOption = {
  id: string
  title: string
  date: string
}

type RedemptionRow = {
  id: string
  voucher_id: string
  event_id: string
  created_at: string
  discount_cents: number
  order_total_cents: number | null
  notes: string | null
  attendee_name: string
  event_title: string
  event_date: string
}

export default function AdminVenuesPage() {
  const { confirm } = useConfirmDialog()
  const [activeTab, setActiveTab] = useState<'venues' | 'redemptions'>('venues')
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [showStaffDialog, setShowStaffDialog] = useState(false)
  const [staffVenue, setStaffVenue] = useState<Venue | null>(null)
  const [staffRows, setStaffRows] = useState<VenueStaffAssignment[]>([])
  const [staffQuery, setStaffQuery] = useState('')
  const [staffResults, setStaffResults] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffSaving, setStaffSaving] = useState<string | null>(null)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [redemptionEventId, setRedemptionEventId] = useState('all')
  const [redemptionFrom, setRedemptionFrom] = useState('')
  const [redemptionTo, setRedemptionTo] = useState('')
  const [venueEvents, setVenueEvents] = useState<EventOption[]>([])
  const [redemptionRows, setRedemptionRows] = useState<RedemptionRow[]>([])
  const [redemptionLoading, setRedemptionLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
    parking_options: '',
    accessibility: '',
    food_drinks_available: false,
    drinks_available: false
  })

  useEffect(() => {
    loadVenues()
  }, [])

  useEffect(() => {
    if (activeTab === 'redemptions' && selectedVenueId) {
      loadVenueEvents(selectedVenueId)
      loadVenueRedemptions(selectedVenueId, redemptionEventId)
    }
  }, [activeTab, selectedVenueId, redemptionEventId, redemptionFrom, redemptionTo])

  async function loadVenues() {
    setLoading(true)
    const { data, error } = await supabase
      .from('venues')
      .select('*')
      .order('name', { ascending: true })

    if (!error && data) {
      setVenues(data)
      if (!selectedVenueId && data.length > 0) {
        setSelectedVenueId(data[0].id)
      }
    }
    setLoading(false)
  }

  async function loadVenueEvents(venueId: string) {
    const { data } = await supabase
      .from('events')
      .select('id, title, date')
      .eq('venue_id', venueId)
      .order('date', { ascending: false })
      .limit(200)
    setVenueEvents((data || []) as EventOption[])
  }

  async function loadVenueRedemptions(venueId: string, eventId: string) {
    setRedemptionLoading(true)
    setRedemptionRows([])

    let vouchersQuery = supabase
      .from('booking_vouchers')
      .select('id, event_id, user_id, venue_id')
      .eq('venue_id', venueId)

    if (eventId !== 'all') {
      vouchersQuery = vouchersQuery.eq('event_id', eventId)
    }

    const { data: vouchers, error: vouchersError } = await vouchersQuery
    if (vouchersError) {
      setRedemptionLoading(false)
      return
    }

    const voucherList = vouchers || []
    if (voucherList.length === 0) {
      setRedemptionLoading(false)
      return
    }

    const voucherIds = voucherList.map((v) => v.id)
    const voucherMap = new Map(voucherList.map((v) => [v.id, v]))
    const userIds = Array.from(new Set(voucherList.map((v: any) => v.user_id).filter(Boolean)))

    let redemptionsQuery = supabase
      .from('voucher_redemptions')
      .select('id, voucher_id, event_id, created_at, discount_cents, order_total_cents, notes')
      .in('voucher_id', voucherIds)

    if (redemptionFrom) {
      redemptionsQuery = redemptionsQuery.gte('created_at', new Date(redemptionFrom).toISOString())
    }
    if (redemptionTo) {
      redemptionsQuery = redemptionsQuery.lte('created_at', new Date(redemptionTo).toISOString())
    }

    const { data: redemptions, error: redemptionsError } = await redemptionsQuery
      .order('created_at', { ascending: false })
      .limit(300)

    if (redemptionsError || !redemptions) {
      setRedemptionLoading(false)
      return
    }

    const eventIds = Array.from(new Set(redemptions.map((r) => r.event_id)))
    const [{ data: eventRows }, { data: profileRows }] = await Promise.all([
      supabase
        .from('events')
        .select('id, title, date')
        .in('id', eventIds),
      userIds.length > 0
        ? supabase.from('profiles').select('id, full_name, email').in('id', userIds)
        : Promise.resolve({ data: [] as any[] } as any),
    ])

    const eventMap = new Map((eventRows || []).map((e: any) => [e.id, e]))
    const profileMap = new Map(
      (profileRows || []).map((p: any) => [p.id, p as { full_name?: string | null; email?: string | null }])
    )
    const mapped: RedemptionRow[] = redemptions
      .map((r: any) => {
        const voucher = voucherMap.get(r.voucher_id as string)
        const event = eventMap.get(r.event_id as string)
        if (!voucher || !event) return null
        const profile = profileMap.get((voucher as any).user_id) as { full_name?: string | null; email?: string | null } | undefined
        const attendeeName = profile?.full_name || profile?.email || 'Attendee'
        return {
          id: r.id,
          voucher_id: r.voucher_id,
          event_id: r.event_id,
          created_at: r.created_at,
          discount_cents: Number(r.discount_cents || 0),
          order_total_cents: r.order_total_cents === null ? null : Number(r.order_total_cents),
          notes: r.notes || null,
          attendee_name: String(attendeeName),
          event_title: String(event.title || 'Event'),
          event_date: String(event.date || ''),
        }
      })
      .filter(Boolean) as RedemptionRow[]

    setRedemptionRows(mapped)
    setRedemptionLoading(false)
  }

  async function openStaffDialog(venue: Venue) {
    setStaffVenue(venue)
    setShowStaffDialog(true)
    setStaffQuery('')
    setStaffResults([])
    await loadVenueStaff(venue.id)
  }

  async function loadVenueStaff(venueId: string) {
    setStaffLoading(true)
    const { data, error } = await supabase
      .from('venue_staff')
      .select('id, venue_id, user_id, staff_role, active, profiles:user_id(id, full_name, email)')
      .eq('venue_id', venueId)
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load venue staff: ' + error.message)
      setStaffRows([])
    } else {
      setStaffRows((data || []) as any)
    }
    setStaffLoading(false)
  }

  async function searchUsers(query: string) {
    setStaffQuery(query)
    if (query.trim().length < 2) {
      setStaffResults([])
      return
    }
    setStaffLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(8)

    if (error) {
      setStaffResults([])
    } else {
      setStaffResults((data || []) as any)
    }
    setStaffLoading(false)
  }

  async function addVenueStaff(userId: string, role: 'cashier' | 'manager' = 'cashier') {
    if (!staffVenue) return
    setStaffSaving(userId)
    const { data: authData } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('venue_staff')
      .upsert(
        {
          venue_id: staffVenue.id,
          user_id: userId,
          staff_role: role,
          active: true,
          created_by: authData.user?.id || null,
        },
        { onConflict: 'venue_id,user_id' }
      )

    if (error) {
      toast.error('Failed to add staff: ' + error.message)
    } else {
      await loadVenueStaff(staffVenue.id)
      setStaffQuery('')
      setStaffResults([])
    }
    setStaffSaving(null)
  }

  async function updateVenueStaffRow(rowId: string, patch: Partial<{ staff_role: 'cashier' | 'manager'; active: boolean }>) {
    if (!staffVenue) return
    setStaffSaving(rowId)
    const { error } = await supabase
      .from('venue_staff')
      .update(patch)
      .eq('id', rowId)
    if (error) {
      toast.error('Failed to update staff: ' + error.message)
    } else {
      await loadVenueStaff(staffVenue.id)
    }
    setStaffSaving(null)
  }

  function resetFormData() {
    setFormData({
      name: '',
      address: '',
      city: '',
      region: '',
      postal_code: '',
      country: '',
      parking_options: '',
      accessibility: '',
      food_drinks_available: false,
      drinks_available: false
    })
  }

  async function handleCreateVenue(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    try {
      const venueData = {
        name: formData.name,
        address: formData.address,
        city: formData.city || null,
        region: formData.region || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        parking_options: formData.parking_options || null,
        accessibility: formData.accessibility || null,
        food_drinks_available: formData.food_drinks_available,
        drinks_available: formData.drinks_available,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('venues')
        .insert(venueData)

      if (error) throw error

      toast.success('Venue created successfully!')
      setShowCreateForm(false)
      resetFormData()
      loadVenues()
    } catch (error: any) {
      console.error('Error creating venue:', error)
      toast.error('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleEditVenue(venue: Venue) {
    setEditingVenue(venue)
    setFormData({
      name: venue.name,
      address: venue.address,
      city: venue.city || '',
      region: venue.region || '',
      postal_code: venue.postal_code || '',
      country: venue.country || '',
      parking_options: venue.parking_options || '',
      accessibility: venue.accessibility || '',
      food_drinks_available: venue.food_drinks_available,
      drinks_available: venue.drinks_available ?? false
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
        city: formData.city || null,
        region: formData.region || null,
        postal_code: formData.postal_code || null,
        country: formData.country || null,
        parking_options: formData.parking_options || null,
        accessibility: formData.accessibility || null,
        food_drinks_available: formData.food_drinks_available,
        drinks_available: formData.drinks_available,
        updated_at: new Date().toISOString()
      }

      const { error } = await supabase
        .from('venues')
        .update(venueData)
        .eq('id', editingVenue.id)

      if (error) throw error

      toast.success('Venue updated successfully!')
      setShowEditForm(false)
      setEditingVenue(null)
      resetFormData()
      loadVenues()
    } catch (error: any) {
      console.error('Error updating venue:', error)
      toast.error('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteVenue(venueId: string, venueName: string) {
    const shouldProceed = await confirm({
      title: 'Delete venue?',
      message: `Are you sure you want to delete "${venueName}"? This will remove the venue from all events that use it.`,
      confirmText: 'Delete venue',
      cancelText: 'Keep venue',
      variant: 'destructive',
    })
    if (!shouldProceed) {
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

      toast.success('Venue deleted successfully!')
      loadVenues()
    } catch (error: any) {
      console.error('Error deleting venue:', error)
      toast.error('Error: ' + error.message)
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

  const redemptionTotals = {
    count: redemptionRows.length,
    totalDiscount: redemptionRows.reduce((sum, row) => sum + row.discount_cents, 0),
    totalOrders: redemptionRows.reduce((sum, row) => sum + (row.order_total_cents || 0), 0),
  }

  return (
    <div>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'venues' | 'redemptions')} className="space-y-4">
        <TabsList>
          <TabsTrigger value="venues">Venues</TabsTrigger>
          <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
        </TabsList>

        <TabsContent value="venues" className="space-y-4">
          <div className="flex justify-end mb-6">
            <Button onClick={() => setShowCreateForm(true)}>
              + Add Venue
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {venues.map((venue) => (
              <Card key={venue.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{venue.name}</CardTitle>
                    <Link
                      href={`/venues/manage/${venue.id}`}
                      className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1 hover:bg-muted/40 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Manage
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 mb-4">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <p className="text-sm text-muted-foreground">{venue.address}</p>
                      {(venue.city || venue.region || venue.country) && (
                        <p className="text-xs text-muted-foreground">
                          {[venue.city, venue.region, venue.postal_code, venue.country].filter(Boolean).join(', ')}
                        </p>
                      )}
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
                    {venue.drinks_available && (
                      <div className="flex items-center gap-2">
                        <Wine className="w-4 h-4 text-muted-foreground" />
                        <Badge variant="secondary">Drinks Available</Badge>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => openStaffDialog(venue)}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      Staff
                    </Button>
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
        </TabsContent>

        <TabsContent value="redemptions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Venue Redemptions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <Label>Venue</Label>
                  <select
                    value={selectedVenueId}
                    onChange={(e) => {
                      setSelectedVenueId(e.target.value)
                      setRedemptionEventId('all')
                    }}
                    className="w-full h-10 px-3 border border-input bg-background rounded-md"
                  >
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Event</Label>
                  <select
                    value={redemptionEventId}
                    onChange={(e) => setRedemptionEventId(e.target.value)}
                    className="w-full h-10 px-3 border border-input bg-background rounded-md"
                  >
                    <option value="all">All events</option>
                    {venueEvents.map((event) => (
                      <option key={event.id} value={event.id}>{event.title}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>From</Label>
                  <Input type="datetime-local" value={redemptionFrom} onChange={(e) => setRedemptionFrom(e.target.value)} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="datetime-local" value={redemptionTo} onChange={(e) => setRedemptionTo(e.target.value)} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Redemptions</p>
                    <p className="text-2xl font-semibold">{redemptionTotals.count}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Total Discount</p>
                    <p className="text-2xl font-semibold">${(redemptionTotals.totalDiscount / 100).toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Order Total Captured</p>
                    <p className="text-2xl font-semibold">${(redemptionTotals.totalOrders / 100).toFixed(2)}</p>
                  </CardContent>
                </Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Redemption Log</CardTitle>
            </CardHeader>
            <CardContent>
              {redemptionLoading ? (
                <p className="text-sm text-muted-foreground">Loading redemptions...</p>
              ) : redemptionRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No redemptions found for current filters.</p>
              ) : (
                <div className="space-y-2">
                  {redemptionRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 border rounded-md p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.event_title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {row.attendee_name} • {formatDateTime(row.created_at)}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline">${(row.discount_cents / 100).toFixed(2)}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="create-city">City</Label>
                <Input
                  id="create-city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div>
                <Label htmlFor="create-region">Region/State</Label>
                <Input
                  id="create-region"
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder="Region"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="create-postal">Postal Code</Label>
                <Input
                  id="create-postal"
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                  placeholder="Postal code"
                />
              </div>
              <div>
                <Label htmlFor="create-country">Country</Label>
                <Input
                  id="create-country"
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                  placeholder="Country"
                />
              </div>
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

            <div>
              <Label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.drinks_available}
                  onChange={(e) => setFormData({ ...formData, drinks_available: e.target.checked })}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm font-medium">
                  Drinks Available
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-city">City</Label>
                <Input
                  id="edit-city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-region">Region/State</Label>
                <Input
                  id="edit-region"
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-postal">Postal Code</Label>
                <Input
                  id="edit-postal"
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-country">Country</Label>
                <Input
                  id="edit-country"
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                />
              </div>
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

            <div>
              <Label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.drinks_available}
                  onChange={(e) => setFormData({ ...formData, drinks_available: e.target.checked })}
                  className="mr-2 h-4 w-4"
                />
                <span className="text-sm font-medium">
                  Drinks Available
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

      {/* Venue Staff Dialog */}
      <Dialog open={showStaffDialog} onOpenChange={(open) => {
        if (!open) {
          setShowStaffDialog(false)
          setStaffVenue(null)
          setStaffRows([])
          setStaffQuery('')
          setStaffResults([])
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Venue Staff</DialogTitle>
            <DialogDescription>
              {staffVenue ? `Assign and manage staff for ${staffVenue.name}` : 'Manage venue staff'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="staff-search">Search user by name or email</Label>
              <Input
                id="staff-search"
                value={staffQuery}
                onChange={(e) => searchUsers(e.target.value)}
                placeholder="Start typing a name or email"
              />
              {staffResults.length > 0 && (
                <div className="mt-2 space-y-2 max-h-44 overflow-auto border rounded-md p-2">
                  {staffResults.map((user) => (
                    <div key={user.id} className="flex items-center justify-between gap-3 border rounded-md p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{user.full_name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={staffSaving === user.id}
                        onClick={() => addVenueStaff(user.id, 'cashier')}
                      >
                        {staffSaving === user.id ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-3">
              <p className="text-sm font-medium mb-2">Current staff</p>
              {staffLoading ? (
                <p className="text-sm text-muted-foreground">Loading staff...</p>
              ) : staffRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff assigned yet.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  {staffRows.map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 border rounded-md p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{row.profiles?.full_name || 'No name'}</p>
                        <p className="text-xs text-muted-foreground truncate">{row.profiles?.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={row.staff_role}
                          onChange={(e) => updateVenueStaffRow(row.id, { staff_role: e.target.value as 'cashier' | 'manager' })}
                          className="h-8 px-2 border border-input bg-background rounded-md text-xs"
                          disabled={staffSaving === row.id}
                        >
                          <option value="cashier">Cashier</option>
                          <option value="manager">Manager</option>
                        </select>
                        <Button
                          size="sm"
                          variant={row.active ? 'destructive' : 'outline'}
                          disabled={staffSaving === row.id}
                          onClick={() => updateVenueStaffRow(row.id, { active: !row.active })}
                        >
                          {staffSaving === row.id ? 'Saving...' : row.active ? 'Disable' : 'Enable'}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
