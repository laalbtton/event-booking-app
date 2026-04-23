'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  ChevronLeft,
  MapPin,
  Car,
  Accessibility,
  UtensilsCrossed,
  Wine,
  Globe,
  Star,
  ExternalLink,
  CalendarDays,
  Eye,
  CreditCard,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { formatDateTime } from '@/lib/dateUtils'
import { cn } from '@/lib/utils'

type Venue = {
  id: string
  name: string
  address: string
  city: string | null
  region: string | null
  postal_code: string | null
  country: string | null
  parking_options: string | null
  accessibility: string | null
  food_drinks_available: boolean
  drinks_available: boolean
  description: string | null
  google_review_url: string | null
  website_url: string | null
}

type UpcomingEvent = {
  id: string
  title: string
  date: string
  status: string | null
  credits_required: number
  event_type: string
}

type VenueCreditGrant = {
  id: string
  user_id: string
  credits_total: number
  credits_remaining: number
  notes: string | null
  issued_at: string
  expires_at: string | null
  user_name: string
  user_email: string
}

type UserSearchResult = {
  id: string
  display_name: string | null
  email: string | null
}

export default function VenueManagePage() {
  const { id: venueId } = useParams<{ id: string }>()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [venue, setVenue] = useState<Venue | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [saving, setSaving] = useState(false)

  // Credit Passes state
  const [grants, setGrants] = useState<VenueCreditGrant[]>([])
  const [grantsLoading, setGrantsLoading] = useState(false)
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<UserSearchResult[]>([])
  const [userSearching, setUserSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null)
  const [issueCredits, setIssueCredits] = useState('')
  const [issueExpiry, setIssueExpiry] = useState('')
  const [issueNotes, setIssueNotes] = useState('')
  const [issuing, setIssuing] = useState(false)

  const [form, setForm] = useState({
    description: '',
    google_review_url: '',
    website_url: '',
    parking_options: '',
    accessibility: '',
    food_drinks_available: false,
    drinks_available: false,
    // admin-only structural fields
    name: '',
    address: '',
    city: '',
    region: '',
    postal_code: '',
    country: '',
  })

  useEffect(() => {
    void load()
    void loadGrants()
  }, [venueId])

  async function load() {
    setLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) {
        router.push('/login')
        return
      }

      // Check permissions
      const [{ data: profile }, { data: staffRow }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).single(),
        supabase
          .from('venue_staff')
          .select('id')
          .eq('venue_id', venueId)
          .eq('user_id', user.id)
          .eq('active', true)
          .maybeSingle(),
      ])

      const admin = (profile as { role?: string } | null)?.role === 'admin'
      const staff = !!staffRow

      if (!admin && !staff) {
        router.push('/dashboard')
        return
      }

      setIsAdmin(admin)

      // Load venue + upcoming events in parallel
      const [{ data: venueData, error: venueError }, { data: eventsData }] = await Promise.all([
        supabase.from('venues').select('*').eq('id', venueId).single(),
        supabase
          .from('events')
          .select('id, title, date, status, credits_required, event_type')
          .eq('venue_id', venueId)
          .gte('date', new Date().toISOString())
          .not('status', 'in', '("cancelled","archived","draft")')
          .order('date', { ascending: true })
          .limit(20),
      ])

      if (venueError || !venueData) {
        toast.error('Venue not found')
        router.push('/dashboard')
        return
      }

      const v = venueData as unknown as Venue
      setVenue(v)
      setUpcomingEvents((eventsData ?? []) as unknown as UpcomingEvent[])
      setForm({
        description: v.description ?? '',
        google_review_url: v.google_review_url ?? '',
        website_url: v.website_url ?? '',
        parking_options: v.parking_options ?? '',
        accessibility: v.accessibility ?? '',
        food_drinks_available: v.food_drinks_available ?? false,
        drinks_available: v.drinks_available ?? false,
        name: v.name,
        address: v.address,
        city: v.city ?? '',
        region: v.region ?? '',
        postal_code: v.postal_code ?? '',
        country: v.country ?? '',
      })
    } catch {
      toast.error('Failed to load venue')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const payload: Record<string, unknown> = {
        description: form.description.trim() || null,
        google_review_url: form.google_review_url.trim() || null,
        website_url: form.website_url.trim() || null,
        parking_options: form.parking_options.trim() || null,
        accessibility: form.accessibility.trim() || null,
        food_drinks_available: form.food_drinks_available,
        drinks_available: form.drinks_available,
      }

      if (isAdmin) {
        payload.name = form.name.trim()
        payload.address = form.address.trim()
        payload.city = form.city.trim() || null
        payload.region = form.region.trim() || null
        payload.postal_code = form.postal_code.trim() || null
        payload.country = form.country.trim() || null
      }

      const res = await fetch(`/api/venues/${venueId}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Save failed')

      // Refresh venue display data
      if (isAdmin) {
        setVenue((prev) =>
          prev
            ? {
                ...prev,
                ...payload,
                name: String(payload.name ?? prev.name),
                address: String(payload.address ?? prev.address),
              }
            : prev,
        )
      } else {
        setVenue((prev) =>
          prev
            ? {
                ...prev,
                description: (payload.description as string | null) ?? null,
                google_review_url: (payload.google_review_url as string | null) ?? null,
                website_url: (payload.website_url as string | null) ?? null,
                parking_options: (payload.parking_options as string | null) ?? null,
                accessibility: (payload.accessibility as string | null) ?? null,
                food_drinks_available: Boolean(payload.food_drinks_available),
                drinks_available: Boolean(payload.drinks_available),
              }
            : prev,
        )
      }

      toast.success('Venue updated')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function loadGrants() {
    setGrantsLoading(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return
      const res = await fetch(`/api/admin/venue-credits?venueId=${venueId}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      const raw = (json.grants ?? []) as Array<{
        id: string
        user_id: string
        credits_total: number
        credits_remaining: number
        notes: string | null
        issued_at: string
        expires_at: string | null
        profiles: { full_name?: string | null; email?: string | null } | null
      }>
      setGrants(
        raw.map((g) => ({
          id: g.id,
          user_id: g.user_id,
          credits_total: g.credits_total,
          credits_remaining: g.credits_remaining,
          notes: g.notes,
          issued_at: g.issued_at,
          expires_at: g.expires_at,
          user_name: g.profiles?.full_name ?? 'Unknown',
          user_email: g.profiles?.email ?? '',
        }))
      )
    } finally {
      setGrantsLoading(false)
    }
  }

  async function searchUsers(query: string) {
    if (!query.trim()) { setUserResults([]); return }
    setUserSearching(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const json = await res.json()
      setUserResults((json.users ?? []) as UserSearchResult[])
    } finally {
      setUserSearching(false)
    }
  }

  async function handleIssuePass() {
    if (!selectedUser) return
    const credits = parseInt(issueCredits, 10)
    if (!credits || credits <= 0) { toast.error('Enter a valid credit amount'); return }
    setIssuing(true)
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) throw new Error('Not authenticated')
      const res = await fetch('/api/admin/venue-credits/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: selectedUser.id,
          venueId,
          credits,
          notes: issueNotes.trim() || null,
          expiresAt: issueExpiry || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Failed to issue pass')
      toast.success(`Issued ${credits} venue credit${credits !== 1 ? 's' : ''} to ${selectedUser.display_name ?? selectedUser.email}`)
      setIssueDialogOpen(false)
      setSelectedUser(null)
      setUserSearch('')
      setUserResults([])
      setIssueCredits('')
      setIssueExpiry('')
      setIssueNotes('')
      void loadGrants()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to issue pass')
    } finally {
      setIssuing(false)
    }
  }

  const fullAddress = venue
    ? [venue.address, venue.city, venue.region, venue.postal_code, venue.country]
        .filter(Boolean)
        .join(', ')
    : ''

  const googleMapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-28">
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-4">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </div>
    )
  }

  if (!venue) return null

  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 space-y-5">
        {/* Back link */}
        <Link
          href={isAdmin ? '/admin/venues' : '/venues/redemptions'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          {isAdmin ? 'All venues' : 'Redemptions'}
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{venue.name}</h1>
          {fullAddress && (
            <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {fullAddress}
            </p>
          )}
        </div>

        {/* Quick action links */}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href={`/venues/${venueId}`} target="_blank">
              <Eye className="h-3.5 w-3.5" />
              View public profile
            </Link>
          </Button>
          {venue.google_review_url && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={venue.google_review_url} target="_blank" rel="noopener noreferrer">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Google reviews
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
          {googleMapsUrl && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer">
                <MapPin className="h-3.5 w-3.5" />
                View on Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link href="/venues/redemptions">
              <UtensilsCrossed className="h-3.5 w-3.5" />
              Redemptions
            </Link>
          </Button>
        </div>

        {/* Edit form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Venue details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Admin-only: structural fields */}
            {isAdmin && (
              <>
                <div>
                  <Label htmlFor="name">Venue name</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="address">Street address</Label>
                  <Input
                    id="address"
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="region">Province / State</Label>
                    <Input
                      id="region"
                      value={form.region}
                      onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="postal_code">Postal code</Label>
                    <Input
                      id="postal_code"
                      value={form.postal_code}
                      onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={form.country}
                      onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                    />
                  </div>
                </div>
                <hr className="border-border" />
              </>
            )}

            {/* Public description */}
            <div>
              <Label htmlFor="description">
                About this venue{' '}
                <span className="text-muted-foreground font-normal">(shown on public profile)</span>
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Describe the space, vibe, and what makes it special for live events…"
                rows={3}
              />
            </div>

            {/* Google Review URL */}
            <div>
              <Label htmlFor="google_review_url" className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500" />
                Google review page URL
              </Label>
              <Input
                id="google_review_url"
                type="url"
                value={form.google_review_url}
                onChange={(e) => setForm((f) => ({ ...f, google_review_url: e.target.value }))}
                placeholder="https://g.page/r/…/review"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Link to your Google Business review page. Attendees will see a "Leave a review"
                button on your public profile.
              </p>
            </div>

            {/* Website */}
            <div>
              <Label htmlFor="website_url" className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" />
                Website
              </Label>
              <Input
                id="website_url"
                type="url"
                value={form.website_url}
                onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                placeholder="https://yourvenue.com"
              />
            </div>

            <hr className="border-border" />

            {/* Operational info */}
            <div>
              <Label htmlFor="parking">Parking options</Label>
              <Input
                id="parking"
                value={form.parking_options}
                onChange={(e) => setForm((f) => ({ ...f, parking_options: e.target.value }))}
                placeholder="e.g. Free street parking, paid lot nearby"
              />
            </div>
            <div>
              <Label htmlFor="accessibility">Accessibility</Label>
              <Input
                id="accessibility"
                value={form.accessibility}
                onChange={(e) => setForm((f) => ({ ...f, accessibility: e.target.value }))}
                placeholder="e.g. Wheelchair accessible, elevator available"
              />
            </div>

            {/* Amenity toggles */}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, food_drinks_available: !f.food_drinks_available }))
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  form.food_drinks_available
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50',
                )}
              >
                <UtensilsCrossed className="h-3.5 w-3.5" />
                Food & drinks
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, drinks_available: !f.drinks_available }))
                }
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  form.drinks_available
                    ? 'border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted/50',
                )}
              >
                <Wine className="h-3.5 w-3.5" />
                Drinks available
              </button>
            </div>

            <Button onClick={() => void handleSave()} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Upcoming shows */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Upcoming shows
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No upcoming shows scheduled at this venue.</p>
            ) : (
              <ul className="space-y-2">
                {upcomingEvents.map((ev) => (
                  <li key={ev.id}>
                    <Link
                      href={`/events/${ev.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(ev.date)}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {ev.credits_required > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {ev.credits_required} cr
                          </Badge>
                        )}
                        {ev.status && ev.status !== 'active' && (
                          <Badge variant="outline" className="text-xs capitalize">
                            {ev.status}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Credit Passes — admin only */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CreditCard className="h-4 w-4" />
                  Credit passes
                </CardTitle>
                <Button size="sm" variant="outline" onClick={() => setIssueDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Issue pass
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                Venue credit passes are redeemable only for shows at <strong>{venue.name}</strong>. They do not affect the user's general credit balance.
              </p>
              {grantsLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : grants.length === 0 ? (
                <p className="text-sm text-muted-foreground">No credit passes issued yet.</p>
              ) : (
                <ul className="space-y-2">
                  {grants.map((g) => {
                    const expired = g.expires_at ? new Date(g.expires_at) <= new Date() : false
                    const spent = g.credits_remaining === 0
                    const dim = expired || spent
                    return (
                      <li
                        key={g.id}
                        className={cn(
                          'rounded-lg border px-3 py-2.5 text-sm',
                          dim ? 'border-border/50 bg-muted/30 opacity-60' : 'border-border bg-background',
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{g.user_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{g.user_email}</p>
                            {g.notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{g.notes}</p>}
                          </div>
                          <div className="shrink-0 text-right space-y-0.5">
                            <p className="font-semibold tabular-nums">
                              {g.credits_remaining}
                              <span className="text-muted-foreground font-normal"> / {g.credits_total} cr</span>
                            </p>
                            {g.expires_at && (
                              <p className="text-xs text-muted-foreground">
                                {expired ? 'Expired' : 'Expires'}{' '}
                                {new Date(g.expires_at).toLocaleDateString()}
                              </p>
                            )}
                            {spent && !expired && (
                              <Badge variant="secondary" className="text-xs">Fully used</Badge>
                            )}
                          </div>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Issue Credit Pass dialog */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Issue venue credit pass</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {/* User search */}
            <div className="space-y-1.5">
              <Label>User</Label>
              {selectedUser ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{selectedUser.display_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{selectedUser.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedUser(null); setUserSearch(''); setUserResults([]) }}
                    className="p-1 rounded hover:bg-muted"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search by name or email…"
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      void searchUsers(e.target.value)
                    }}
                  />
                  {userResults.length > 0 && (
                    <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border bg-popover shadow-md">
                      {userResults.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                            onClick={() => { setSelectedUser(u); setUserSearch(''); setUserResults([]) }}
                          >
                            <span className="font-medium">{u.display_name ?? '—'}</span>
                            <span className="text-muted-foreground ml-1.5 text-xs">{u.email}</span>
                          </button>
                        </li>
                      ))}
                      {userSearching && (
                        <li className="px-3 py-2 text-xs text-muted-foreground">Searching…</li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>

            {/* Credits */}
            <div className="space-y-1.5">
              <Label htmlFor="issue-credits">Credits to issue</Label>
              <Input
                id="issue-credits"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 3"
                value={issueCredits}
                onChange={(e) => setIssueCredits(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">These credits can only be used for shows at {venue.name}.</p>
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <Label htmlFor="issue-expiry">Expiry date (optional)</Label>
              <Input
                id="issue-expiry"
                type="date"
                value={issueExpiry}
                onChange={(e) => setIssueExpiry(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="issue-notes">Notes (optional)</Label>
              <Input
                id="issue-notes"
                placeholder="e.g. Performer loyalty reward"
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIssueDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleIssuePass()} disabled={!selectedUser || !issueCredits || issuing}>
              {issuing ? 'Issuing…' : 'Issue pass'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
