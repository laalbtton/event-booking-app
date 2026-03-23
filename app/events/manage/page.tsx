'use client'

import { useEffect, useRef, useState } from 'react'
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
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { QrCode, Link as LinkIcon, Image as ImageIcon, Trash2, MoreVertical, Copy, Edit, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { appendSlugSuffix, buildEventSlugBase } from '@/lib/seo/slug'
import { toast } from 'sonner'

type Venue = {
  id: string
  name: string
  address: string
}

const MAX_POSTER_BYTES = 10 * 1024 * 1024

export default function EventManagementPage() {
  const { confirm } = useConfirmDialog()
  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Event | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming')
  const [venues, setVenues] = useState<Venue[]>([])
  const [posterUploadingId, setPosterUploadingId] = useState<string | null>(null)
  const [posterJobSummary, setPosterJobSummary] = useState<Record<string, { posted: number; failed: number; pending: number; skipped: number }>>({})
  const [posterPublishMeta, setPosterPublishMeta] = useState<Record<string, { count: number; lastPublishedAt: string | null }>>({})
  const router = useRouter()
  const [createStep, setCreateStep] = useState<'details' | 'tickets' | 'variety'>('details')
  const [editVarietyOpen, setEditVarietyOpen] = useState(false)
  const [editTicketsOpen, setEditTicketsOpen] = useState(false)
  const [languageInput, setLanguageInput] = useState('')
  const [varietyArtTypes, setVarietyArtTypes] = useState<Array<{ id?: string; art_type_name: string; slot_capacity: string }>>([])

  // Three-dot menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const posterInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Venue request state
  const [showVenueRequestForm, setShowVenueRequestForm] = useState(false)
  const [venueRequestName, setVenueRequestName] = useState('')
  const [venueRequestAddress, setVenueRequestAddress] = useState('')
  const [venueRequestSubmitting, setVenueRequestSubmitting] = useState(false)
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    theme: '',
    rating: '18+',
    event_type: 'open_mic',
    open_mic_type: 'comedy_open_mic',
    variety_use_max_attendees: false,
    is_multilingual: false,
    languages: ['English'] as string[],
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
    audience_capacity: '15',
    tickets_redeemable_credits_enabled: false,
    tickets_redeemable_credits_amount: '5',
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

  function sanitizeLanguage(input: string): string {
    const trimmed = input.trim()
    if (!trimmed) return ''
    return trimmed.replace(/\s+/g, ' ')
  }

  async function getUniqueEventSlug(baseSlug: string, currentEventId?: string): Promise<string> {
    const base = baseSlug || 'event'
    let candidate = base
    let attempt = 0
    while (attempt < 25) {
      let query = supabase.from('events').select('id').eq('slug', candidate).limit(1)
      if (currentEventId) query = query.neq('id', currentEventId)
      const { data } = await query
      if (!data || data.length === 0) return candidate
      attempt += 1
      candidate = appendSlugSuffix(base, String(attempt))
    }
    return appendSlugSuffix(base, String(Date.now()))
  }

  function addLanguageTag() {
    const next = sanitizeLanguage(languageInput)
    if (!next) return
    const exists = formData.languages.some((lang) => lang.toLowerCase() === next.toLowerCase())
    if (exists) {
      setLanguageInput('')
      return
    }
    setFormData((prev) => ({ ...prev, languages: [...prev.languages, next] }))
    setLanguageInput('')
  }

  function removeLanguageTag(tag: string) {
    if (tag.toLowerCase() === 'english') return
    setFormData((prev) => ({ ...prev, languages: prev.languages.filter((lang) => lang !== tag) }))
  }

  function normalizeLanguages(): string[] {
    const deduped = formData.languages
      .map((lang) => sanitizeLanguage(lang))
      .filter(Boolean)
      .filter((lang, idx, arr) => arr.findIndex((l) => l.toLowerCase() === lang.toLowerCase()) === idx)

    if (!deduped.some((lang) => lang.toLowerCase() === 'english')) {
      deduped.unshift('English')
    }
    return deduped
  }

  function addVarietyArtType() {
    if (varietyArtTypes.length >= 5) return
    setVarietyArtTypes((prev) => [...prev, { art_type_name: '', slot_capacity: '1' }])
  }

  function updateVarietyArtType(index: number, patch: Partial<{ art_type_name: string; slot_capacity: string }>) {
    setVarietyArtTypes((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
    )
  }

  function removeVarietyArtType(index: number) {
    setVarietyArtTypes((prev) => prev.filter((_, idx) => idx !== index))
  }

  function validateVarietyTypes(): { ok: boolean; error?: string } {
    const normalized = varietyArtTypes
      .map((item) => ({
        name: item.art_type_name.trim(),
        slots: Number(item.slot_capacity || 0),
      }))
      .filter((item) => item.name.length > 0)

    if (normalized.length === 0) {
      return { ok: false, error: 'Add at least one art performance type for variety arts.' }
    }
    if (normalized.length > 5) {
      return { ok: false, error: 'You can configure up to 5 art performance types.' }
    }
    const totalSlots = normalized.reduce((sum, item) => sum + item.slots, 0)
    if (
      !formData.variety_use_max_attendees &&
      (totalSlots <= 0 || normalized.some((item) => !Number.isFinite(item.slots) || item.slots < 1))
    ) {
      return { ok: false, error: 'Each art type must have at least 1 performance slot.' }
    }
    const names = normalized.map((item) => item.name.toLowerCase())
    if (new Set(names).size !== names.length) {
      return { ok: false, error: 'Art type names must be unique.' }
    }
    return { ok: true }
  }

  async function saveEventArtTypes(eventId: string): Promise<Error | null> {
    const isVarietyOpenMic =
      formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'

    if (!isVarietyOpenMic) {
      const { error } = await supabase.from('event_art_types').delete().eq('event_id', eventId)
      return error ? new Error(error.message) : null
    }

    const maxAttendeesForVariety = Math.max(1, Number(formData.max_attendees || 1))
    const cleaned = varietyArtTypes
      .map((item) => ({
        id: item.id,
        art_type_name: item.art_type_name.trim(),
        slot_capacity: formData.variety_use_max_attendees
          ? maxAttendeesForVariety
          : Math.max(1, Number(item.slot_capacity || 1)),
      }))
      .filter((item) => item.art_type_name.length > 0)
      .slice(0, 5)

    const { error: deleteError } = await supabase.from('event_art_types').delete().eq('event_id', eventId)
    if (deleteError) return new Error(deleteError.message)
    if (cleaned.length > 0) {
      const { error: insertError } = await supabase.from('event_art_types').insert(
        cleaned.map((item) => ({
          event_id: eventId,
          art_type_name: item.art_type_name,
          slot_capacity: item.slot_capacity,
        }))
      )
      if (insertError) return new Error(insertError.message)
    }
    return null
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

    // Allow platform event_creator/admin OR community-level event_creator/co_admin/admin
    const isPlatformAllowed = profile.role === 'event_creator' || profile.role === 'admin'
    if (!isPlatformAllowed) {
      const { count } = await supabase
        .from('community_members')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('role', ['event_creator', 'co_admin', 'admin'])
      if (!count || count === 0) {
        router.push('/dashboard')
        return
      }
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

  async function loadVenues() {
    try {
      const { data: venuesData, error: venuesError } = await supabase
        .from('venues')
        .select('id, name, address, status')
        .in('status', ['approved', 'pending'])
        .order('name', { ascending: true })

      if (venuesError) throw venuesError
      setVenues((venuesData || []).map((v: any) => ({
        id: v.id,
        name: v.status === 'pending' ? `${v.name} (pending approval)` : v.name,
        address: v.address,
      })))
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
      event_type: 'open_mic',
      open_mic_type: 'comedy_open_mic',
      variety_use_max_attendees: false,
      is_multilingual: false,
      languages: ['English'],
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
      audience_capacity: '15',
      tickets_redeemable_credits_enabled: false,
      tickets_redeemable_credits_amount: '5',
      food_coupon_enabled: false,
      spot_fee_credits: '5',
      food_coupon_value_cents: '500',
      food_coupon_expires_hours: '24',
      max_attendees: '',
      cancellation_hours: '4',
      open_registration_now: true,
      registration_opens_at: ''
    })
    setLanguageInput('')
    setVarietyArtTypes([])
    setEditVarietyOpen(false)
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
        toast.error('Please select a venue')
        setSubmitting(false)
        return
      }

      if (formData.tickets_enabled && formData.external_event && !formData.external_ticket_url) {
        toast.error('Please provide an external ticket link')
        setSubmitting(false)
        return
      }

      if (formData.tickets_enabled && !formData.external_event) {
        const priceValue = parseFloat(formData.ticket_price)
        const quantityValue = parseInt(formData.ticket_quantity)
        const minAllowedPrice = formData.tickets_redeemable_credits_enabled ? 0 : 0.01
        if (!Number.isFinite(priceValue) || priceValue < minAllowedPrice || !Number.isFinite(quantityValue) || quantityValue <= 0) {
          toast.error('Please provide a valid ticket price and quantity')
          setSubmitting(false)
          return
        }
      }

      if (formData.is_multilingual && normalizeLanguages().length < 2) {
        toast.error('Add at least one additional language for multilingual events.')
        setSubmitting(false)
        return
      }

      const isVarietyOpenMic =
        formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'
      if (isVarietyOpenMic) {
        const validity = validateVarietyTypes()
        if (!validity.ok) {
          toast.error(validity.error || 'Please fix variety slot configuration')
          setSubmitting(false)
          return
        }
      }

      const durationMinutes = hoursToMinutes(formData.duration_hours)
      const endTimeValue = formData.end_time || computeEndTime(formData.date, durationMinutes)
      const endTimeIso = endTimeValue ? new Date(endTimeValue).toISOString() : null

      const isBookedShow = formData.event_type === 'booked_show'
      const isTicketed = formData.tickets_enabled
      const normalizedLanguages = normalizeLanguages()
      const slugBase = buildEventSlugBase(formData.title, location, new Date(formData.date).toISOString())
      const slug = await getUniqueEventSlug(slugBase)
      const eventData = {
        slug,
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        event_type: formData.event_type || 'open_mic',
        open_mic_type: formData.event_type === 'open_mic' ? (formData.open_mic_type || 'comedy_open_mic') : null,
        variety_use_max_attendees:
          formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'
            ? !!formData.variety_use_max_attendees
            : false,
        is_multilingual: !!formData.is_multilingual,
        languages: normalizedLanguages,
        tickets_enabled: !!formData.tickets_enabled,
        external_event: !!formData.external_event,
        external_ticket_url: formData.tickets_enabled && formData.external_event
          ? formData.external_ticket_url || null
          : null,
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        venue_id: formData.venue_id || null,
        location: location,
        credits_required: isBookedShow ? 0 : parseInt(formData.credits_required),
        audience_capacity: isTicketed ? parseInt(formData.audience_capacity || '15') : 0,
        audience_deposit_credits: isTicketed && formData.tickets_redeemable_credits_enabled
          ? parseInt(formData.tickets_redeemable_credits_amount || '5')
          : 0,
        food_coupon_enabled: !isBookedShow && !!formData.food_coupon_enabled,
        spot_fee_credits: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.spot_fee_credits || '0') : 0,
        food_coupon_value_cents: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.food_coupon_value_cents || '0') : 0,
        food_coupon_expires_hours: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.food_coupon_expires_hours || '24') : 24,
        max_attendees: formData.max_attendees ? parseInt(formData.max_attendees) : null,
        cancellation_hours: isBookedShow ? 0 : parseInt(formData.cancellation_hours),
        registration_opens_at: formData.open_registration_now 
          ? null 
          : formData.registration_opens_at 
            ? new Date(formData.registration_opens_at).toISOString() 
            : null,
        created_by: user.id,
        host_user_id: user.id,
        // Platform admins create events live; everyone else goes through approval
        status: userRole === 'admin' ? 'active' : 'pending_approval',
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

      const artTypeError = await saveEventArtTypes(data.id)
      if (artTypeError) {
        console.error('Error saving variety art types:', artTypeError)
        throw artTypeError
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

      // Associate event with communities where the creator is an event_creator or above
      // Use ORDER BY joined_at so the primary community is deterministic
      let primaryCommunityId: string | null = null
      try {
        const { data: creatorMemberships } = await supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', user.id)
          .in('role', ['event_creator', 'co_admin', 'admin'])
          .order('joined_at', { ascending: true })

        if (creatorMemberships && creatorMemberships.length > 0) {
          primaryCommunityId = creatorMemberships[0].community_id
          const commSession = await supabase.auth.getSession()
          const accessToken = commSession.data.session?.access_token
          if (accessToken) {
            for (let idx = 0; idx < Math.min(creatorMemberships.length, 3); idx++) {
              const membership = creatorMemberships[idx]
              const res = await fetch(`/api/communities/${membership.community_id}/submit-event`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                body: JSON.stringify({ eventId: data.id, isPrimary: idx === 0 }),
              }).catch((err) => { console.warn('submit-event fetch error:', err); return null })
              if (res && !res.ok) {
                const errBody = await res.json().catch(() => ({}))
                console.warn(`submit-event failed for community ${membership.community_id}:`, errBody)
              }
            }
          }
        }
      } catch (communityErr) {
        console.warn('Failed to link event to communities:', communityErr)
      }

      // If event is pending approval, notify community admins for review
      // Use the same primaryCommunityId determined above for consistency
      if (userRole !== 'admin') {
        try {
          if (primaryCommunityId) {
            const { data: communityAdmins } = await supabase
              .from('community_members')
              .select('user_id')
              .eq('community_id', primaryCommunityId)
              .in('role', ['admin', 'co_admin'])
            for (const admin of (communityAdmins || []) as { user_id: string }[]) {
              await supabase.rpc('create_notification', {
                p_user_id: admin.user_id,
                p_type: 'event_pending_approval',
                p_title: 'New Event Awaiting Approval',
                p_message: `"${(formData as any).title}" has been submitted and is waiting for your review.`,
                p_related_booking_id: null,
                p_related_event_id: data.id,
              }).then(null, () => null)
            }
          }
        } catch { /* non-blocking */ }
      }

      // Only notify users if the event is live (admin-created); pending events notify after approval
      if (userRole === 'admin') {
        try {
          const { data: sessionData } = await supabase.auth.getSession()
          const accessToken = sessionData.session?.access_token
          if (accessToken) {
            await fetch('/api/events/notify-new', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
              },
              body: JSON.stringify({ eventId: data.id }),
            })
          }
        } catch (pushErr) {
          console.warn('Failed to send new event push notification:', pushErr)
        }
      }

      if (userRole === 'admin') {
        toast.success('Event created successfully!')
      } else {
        toast.success('Event submitted for review! You\'ll be notified within 24 hours once approved.')
      }
      setShowCreateForm(false)
      setCreateStep('details')
      resetFormData()
      loadEvents()
    } catch (error: any) {
      console.error('Full error:', error)
      toast.error('Error: ' + error.message)
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

    const { data: ticketData } = await supabase
      .from('event_tickets')
      .select('price_cents, quantity')
      .eq('event_id', event.id)
      .maybeSingle()

    const { data: artTypeData } = await supabase
      .from('event_art_types')
      .select('id, art_type_name, slot_capacity')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })

    setFormData({
      title: event.title,
      description: event.description || '',
      theme: event.theme || '',
      rating: (event as any).rating || '18+',
      event_type: (event as any).event_type || 'open_mic',
      open_mic_type: (event as any).open_mic_type || 'comedy_open_mic',
      variety_use_max_attendees: !!(event as any).variety_use_max_attendees,
      is_multilingual: !!(event as any).is_multilingual,
      languages: Array.isArray((event as any).languages) && (event as any).languages.length > 0
        ? (event as any).languages
        : ['English'],
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
      audience_capacity: ((event as any).audience_capacity ?? 15).toString(),
      tickets_redeemable_credits_enabled: Number((event as any).audience_deposit_credits || 0) > 0,
      tickets_redeemable_credits_amount: (((event as any).audience_deposit_credits ?? 5) || 5).toString(),
      food_coupon_enabled: !!(event as any).food_coupon_enabled,
      spot_fee_credits: ((event as any).spot_fee_credits ?? 5).toString(),
      food_coupon_value_cents: ((event as any).food_coupon_value_cents ?? 500).toString(),
      food_coupon_expires_hours: ((event as any).food_coupon_expires_hours ?? 24).toString(),
      max_attendees: event.max_attendees ? event.max_attendees.toString() : '',
      cancellation_hours: event.cancellation_hours.toString(),
      open_registration_now: !event.registration_opens_at,
      registration_opens_at: regOpensAt
    })
    setVarietyArtTypes(
      (artTypeData || []).map((item: any) => ({
        id: item.id,
        art_type_name: item.art_type_name,
        slot_capacity: String(item.slot_capacity),
      }))
    )
    setEditVarietyOpen(false)
    setEditTicketsOpen(false)
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
        toast.error('Please select a venue')
        setSubmitting(false)
        return
      }

      if (formData.tickets_enabled && formData.external_event && !formData.external_ticket_url) {
        toast.error('Please provide an external ticket link')
        setSubmitting(false)
        return
      }

      if (formData.tickets_enabled && !formData.external_event) {
        const priceValue = parseFloat(formData.ticket_price)
        const quantityValue = parseInt(formData.ticket_quantity)
        const minAllowedPrice = formData.tickets_redeemable_credits_enabled ? 0 : 0.01
        if (!Number.isFinite(priceValue) || priceValue < minAllowedPrice || !Number.isFinite(quantityValue) || quantityValue <= 0) {
          toast.error('Please provide a valid ticket price and quantity')
          setSubmitting(false)
          return
        }
      }

      if (formData.is_multilingual && normalizeLanguages().length < 2) {
        toast.error('Add at least one additional language for multilingual events.')
        setSubmitting(false)
        return
      }

      const isVarietyOpenMic =
        formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'
      if (isVarietyOpenMic) {
        const validity = validateVarietyTypes()
        if (!validity.ok) {
          toast.error(validity.error || 'Please fix variety slot configuration')
          setSubmitting(false)
          return
        }
      }

      const durationMinutes = hoursToMinutes(formData.duration_hours)
      const endTimeValue = formData.end_time || computeEndTime(formData.date, durationMinutes)
      const endTimeIso = endTimeValue ? new Date(endTimeValue).toISOString() : null

      const previousMax = editingEvent.max_attendees ?? null
      const nextMax = formData.max_attendees ? parseInt(formData.max_attendees) : null
      const isBookedShow = formData.event_type === 'booked_show'
      const isTicketed = formData.tickets_enabled
      const normalizedLanguages = normalizeLanguages()
      const slugBase = buildEventSlugBase(formData.title, locationValue, new Date(formData.date).toISOString())
      const slug = await getUniqueEventSlug(slugBase, editingEvent.id)

      const eventData = {
        slug,
        title: formData.title,
        description: formData.description,
        theme: formData.theme || null,
        rating: formData.rating || '18+',
        event_type: formData.event_type || 'open_mic',
        open_mic_type: formData.event_type === 'open_mic' ? (formData.open_mic_type || 'comedy_open_mic') : null,
        variety_use_max_attendees:
          formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'
            ? !!formData.variety_use_max_attendees
            : false,
        is_multilingual: !!formData.is_multilingual,
        languages: normalizedLanguages,
        tickets_enabled: !!formData.tickets_enabled,
        external_event: !!formData.external_event,
        external_ticket_url: formData.tickets_enabled && formData.external_event
          ? formData.external_ticket_url || null
          : null,
        date: new Date(formData.date).toISOString(),
        end_time: endTimeIso,
        location: locationValue,
        credits_required: isBookedShow ? 0 : parseInt(formData.credits_required),
        audience_capacity: isTicketed ? parseInt(formData.audience_capacity || '15') : 0,
        audience_deposit_credits: isTicketed && formData.tickets_redeemable_credits_enabled
          ? parseInt(formData.tickets_redeemable_credits_amount || '5')
          : 0,
        food_coupon_enabled: !isBookedShow && !!formData.food_coupon_enabled,
        spot_fee_credits: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.spot_fee_credits || '0') : 0,
        food_coupon_value_cents: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.food_coupon_value_cents || '0') : 0,
        food_coupon_expires_hours: !isBookedShow && formData.food_coupon_enabled ? parseInt(formData.food_coupon_expires_hours || '24') : 24,
        max_attendees: nextMax,
        cancellation_hours: isBookedShow ? 0 : parseInt(formData.cancellation_hours),
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

      const artTypeError = await saveEventArtTypes(editingEvent.id)
      if (artTypeError) {
        console.error('Error saving variety art types:', artTypeError)
        throw artTypeError
      }

      if (formData.tickets_enabled && !formData.external_event) {
        const ticketPrice = Math.round(parseFloat(formData.ticket_price) * 100)
        const ticketQuantity = parseInt(formData.ticket_quantity)
        await supabase.from('event_tickets').upsert(
          {
            event_id: editingEvent.id,
            name: 'General Admission',
            price_cents: ticketPrice,
            quantity: ticketQuantity,
          },
          { onConflict: 'event_id' }
        )
      }

      const isVarietyForPromotions =
        formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic'
      const canPromoteByMaxIncrease =
        !isVarietyForPromotions || (isVarietyForPromotions && formData.variety_use_max_attendees)
      if (canPromoteByMaxIncrease && previousMax !== null && nextMax !== null && nextMax > previousMax) {
        const promotionsNeeded = nextMax - previousMax
        for (let i = 0; i < promotionsNeeded; i += 1) {
          const { data: promoteResult } = await supabase.rpc('promote_waitlist_and_update_positions_scoped', {
            event_uuid: editingEvent.id,
            booking_scope_filter: 'performer',
            event_art_type_uuid: null,
            capacity_limit: nextMax,
            include_all_art_types: isVarietyForPromotions && formData.variety_use_max_attendees,
          })
          if (!promoteResult || !promoteResult.promoted) {
            break
          }
        }
      }

      toast.success('Event updated successfully!')
      setShowEditForm(false)
      setEditingEvent(null)
      resetFormData()
      loadEvents()

      // Invalidate public page caches so the events listing reflects the change
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (token) {
        fetch(`/api/events/${editingEvent.id}/revalidate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ slug: (editingEvent as any).slug }),
        }).catch(() => null)
      }
    } catch (error: any) {
      console.error('Full error:', error)
      toast.error('Error: ' + error.message)
    } finally {
      setSubmitting(false)
    }
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
        toast.info('This event is already cancelled.')
        return
      }

      toast.success('Event cancelled and refunds processed.')
      loadEvents()
    } catch (error: any) {
      console.error('Error cancelling event:', error)
      toast.error('Error: ' + error.message)
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  async function handleDuplicateEvent(event: Event) {
    setOpenMenuId(null)

    const eventDate = new Date(event.date)
    const localDateTime = toLocalDateTimeString(eventDate)
    const endTimeValue = (event as any).end_time
      ? toLocalDateTimeString(new Date((event as any).end_time))
      : computeEndTime(localDateTime, 120)
    const durationMinutes = computeDurationMinutes(localDateTime, endTimeValue) || 120

    const { data: ticketData } = await supabase
      .from('event_tickets')
      .select('price_cents, quantity')
      .eq('event_id', event.id)
      .maybeSingle()

    const { data: artTypeData } = await supabase
      .from('event_art_types')
      .select('art_type_name, slot_capacity')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })

    setFormData({
      title: `${event.title} (Copy)`,
      description: event.description || '',
      theme: event.theme || '',
      rating: (event as any).rating || '18+',
      event_type: (event as any).event_type || 'open_mic',
      open_mic_type: (event as any).open_mic_type || 'comedy_open_mic',
      variety_use_max_attendees: !!(event as any).variety_use_max_attendees,
      is_multilingual: !!(event as any).is_multilingual,
      languages: Array.isArray((event as any).languages) && (event as any).languages.length > 0
        ? (event as any).languages
        : ['English'],
      tickets_enabled: !!(event as any).tickets_enabled,
      external_event: !!(event as any).external_event,
      external_ticket_url: (event as any).external_ticket_url || '',
      ticket_price: ticketData ? (ticketData.price_cents / 100).toFixed(2) : '',
      ticket_quantity: ticketData ? ticketData.quantity.toString() : '',
      // Clear the date — the user must pick a new one
      date: '',
      end_time: '',
      duration_hours: minutesToHoursString(durationMinutes),
      venue_id: (event as any).venue_id || '',
      credits_required: event.credits_required.toString(),
      audience_capacity: ((event as any).audience_capacity ?? 15).toString(),
      tickets_redeemable_credits_enabled: Number((event as any).audience_deposit_credits || 0) > 0,
      tickets_redeemable_credits_amount: (((event as any).audience_deposit_credits ?? 5) || 5).toString(),
      food_coupon_enabled: !!(event as any).food_coupon_enabled,
      spot_fee_credits: ((event as any).spot_fee_credits ?? 5).toString(),
      food_coupon_value_cents: ((event as any).food_coupon_value_cents ?? 500).toString(),
      food_coupon_expires_hours: ((event as any).food_coupon_expires_hours ?? 24).toString(),
      max_attendees: event.max_attendees ? event.max_attendees.toString() : '',
      cancellation_hours: event.cancellation_hours.toString(),
      open_registration_now: true,
      registration_opens_at: '',
    })
    setVarietyArtTypes(
      (artTypeData || []).map((item: any) => ({
        art_type_name: item.art_type_name,
        slot_capacity: String(item.slot_capacity),
      }))
    )
    setCreateStep('details')
    setShowCreateForm(true)
    toast.info('Fill in a new date and submit to create the duplicate event.')
  }

  async function handlePosterUpload(eventId: string, file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file')
      return
    }
    if (file.size > MAX_POSTER_BYTES) {
      toast.error('Poster file must be 10MB or smaller')
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
        body: JSON.stringify({
          eventId,
          action: 'set',
          posterUrl: publicUrl,
          posterCaption: caption,
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to save poster')

      toast.success(`Poster saved. Queued ${result.jobs?.jobsQueued || 0} auto-post job(s).`)
      await loadEvents()
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload poster')
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
        body: JSON.stringify({
          eventId,
          action: 'remove',
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Failed to remove poster')
      await loadEvents()
    } catch (error: any) {
      toast.error(error.message || 'Failed to remove poster')
    } finally {
      setPosterUploadingId(null)
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
          <Button onClick={() => {
            setCreateStep('details')
            setShowCreateForm(true)
          }}>
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
                  {/* Hidden file input for poster upload — triggered via ref */}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    ref={(el) => { posterInputRefs.current[event.id] = el }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handlePosterUpload(event.id, file)
                      e.currentTarget.value = ''
                    }}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg font-bold leading-tight">{event.title}</CardTitle>
                        {event.status === 'cancelled' && (
                          <Badge variant="destructive" className="mt-1">Cancelled</Badge>
                        )}
                        {event.status === 'pending_approval' && (
                          <Badge variant="secondary" className="mt-1">Pending Approval</Badge>
                        )}
                      </div>
                      {/* Three-dot menu */}
                      <div className="relative shrink-0" ref={openMenuId === event.id ? menuRef : undefined}>
                        <button
                          type="button"
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setOpenMenuId(openMenuId === event.id ? null : event.id)}
                          aria-label="Event actions"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === event.id && (
                          <div className="absolute right-0 top-8 z-50 w-52 bg-popover border border-border rounded-lg shadow-lg py-1 text-sm">
                            {/* Edit — upcoming only, not cancelled */}
                            {activeTab === 'upcoming' && event.status !== 'cancelled' && (
                              <button
                                type="button"
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                                onClick={() => { setOpenMenuId(null); handleEditEvent(event) }}
                              >
                                <Edit className="w-4 h-4 text-muted-foreground" />
                                Edit Details
                              </button>
                            )}
                            {/* Copy public link */}
                            <button
                              type="button"
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                              onClick={() => {
                                setOpenMenuId(null)
                                const publicUrl = `${window.location.origin}/events/${event.slug || event.id}`
                                navigator.clipboard.writeText(publicUrl)
                                toast.success('Public link copied!')
                              }}
                            >
                              <LinkIcon className="w-4 h-4 text-muted-foreground" />
                              Copy Public Link
                            </button>
                            {/* Poster upload — upcoming only */}
                            {activeTab === 'upcoming' && (
                              <button
                                type="button"
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                                disabled={posterUploadingId === event.id}
                                onClick={() => {
                                  setOpenMenuId(null)
                                  posterInputRefs.current[event.id]?.click()
                                }}
                              >
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                {posterUploadingId === event.id ? 'Saving…' : event.poster_url ? 'Update Poster' : 'Add Poster'}
                              </button>
                            )}
                            {/* Remove poster — upcoming only, if poster exists */}
                            {activeTab === 'upcoming' && event.poster_url && (
                              <button
                                type="button"
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left text-rose-600"
                                disabled={posterUploadingId === event.id}
                                onClick={() => { setOpenMenuId(null); handlePosterRemove(event.id) }}
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove Poster
                              </button>
                            )}
                            {/* QR Code — upcoming only */}
                            {activeTab === 'upcoming' && (
                              <Link
                                href={`/events/${event.id}/qr`}
                                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                                onClick={() => setOpenMenuId(null)}
                              >
                                <QrCode className="w-4 h-4 text-muted-foreground" />
                                Generate QR Code
                              </Link>
                            )}
                            {/* Attendance */}
                            <Link
                              href={`/events/${event.id}/attendance`}
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                              onClick={() => setOpenMenuId(null)}
                            >
                              <Users className="w-4 h-4 text-muted-foreground" />
                              {activeTab === 'upcoming' ? 'Manage Attendance' : 'View Attendance'}
                            </Link>
                            {/* Duplicate */}
                            <button
                              type="button"
                              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left"
                              onClick={() => handleDuplicateEvent(event)}
                            >
                              <Copy className="w-4 h-4 text-muted-foreground" />
                              Duplicate Event
                            </button>
                            {/* Cancel — upcoming only, not already cancelled */}
                            {activeTab === 'upcoming' && event.status !== 'cancelled' && (
                              <>
                                <div className="border-t border-border my-1" />
                                <button
                                  type="button"
                                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted text-left text-destructive"
                                  onClick={() => { setOpenMenuId(null); handleCancelEvent(event.id, event.title) }}
                                >
                                  <X className="w-4 h-4" />
                                  Cancel Event
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground line-clamp-2 whitespace-pre-wrap break-words">{event.description}</p>
                    
                    <div className="text-sm text-muted-foreground space-y-1.5">
                      <p>📅 {formatDateTime(event.date)}</p>
                      <p>📍 {event.location}</p>
                      {event.theme && <p>🎨 Theme: {event.theme}</p>}
                      <p>🔞 {event.rating || '18+'}</p>
                      {event.event_type === 'booked_show' ? (
                        <p>🎟️ Invite only</p>
                      ) : (
                        <p>💳 {event.credits_required} credits</p>
                      )}
                      {event.max_attendees && <p>👥 Max {event.max_attendees} attendees</p>}
                      {event.event_type !== 'booked_show' && (
                        <p>⏱️ Cancel up to {event.cancellation_hours || 4} hours before</p>
                      )}
                    </div>

                    {event.poster_url && (
                      <div className="text-xs text-sky-700 space-y-1">
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
                {createStep === 'details' && (
                  <>
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
                    Event Type
                  </label>
                  <div className="flex items-center gap-4">
                    {[
                      { value: 'open_mic', label: 'Open Mic' },
                      { value: 'booked_show', label: 'Booked Show' },
                    ].map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="event_type"
                          value={option.value}
                          checked={formData.event_type === option.value}
                          onChange={(e) => {
                            const nextType = e.target.value
                            setFormData({
                              ...formData,
                              event_type: nextType,
                              open_mic_type: nextType === 'open_mic' ? (formData.open_mic_type || 'comedy_open_mic') : null as any,
                              variety_use_max_attendees: nextType === 'open_mic' ? formData.variety_use_max_attendees : false,
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

                {formData.event_type === 'open_mic' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Open Mic Type
                    </label>
                    <div className="flex items-center gap-4">
                      {[
                        { value: 'comedy_open_mic', label: 'Comedy Open Mic' },
                        { value: 'variety_arts_open_mic', label: 'Variety Arts Open Mic' },
                      ].map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="radio"
                            name="open_mic_type"
                            value={option.value}
                            checked={formData.open_mic_type === option.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                open_mic_type: e.target.value as any,
                                variety_use_max_attendees: e.target.value === 'variety_arts_open_mic'
                                  ? formData.variety_use_max_attendees
                                  : false,
                              })
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic' && (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">Set art performance types and slot capacities.</p>
                    <Button type="button" size="sm" variant="outline" onClick={() => setCreateStep('variety')}>
                      Configure variety slots
                    </Button>
                  </div>
                )}

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

                <div className="space-y-2">
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

                  {!showVenueRequestForm ? (
                    <button
                      type="button"
                      onClick={() => setShowVenueRequestForm(true)}
                      className="text-sm text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      My venue isn&apos;t listed &mdash; request it
                    </button>
                  ) : (
                    <div className="rounded-md border border-border p-3 space-y-3 bg-muted/30">
                      <p className="text-sm font-medium">Request a new venue</p>
                      <p className="text-xs text-muted-foreground">
                        A community admin will review it. Your event will also be held for review.
                      </p>
                      <div className="space-y-2">
                        <Input
                          placeholder="Venue name *"
                          value={venueRequestName}
                          onChange={(e) => setVenueRequestName(e.target.value)}
                        />
                        <Input
                          placeholder="Full address *"
                          value={venueRequestAddress}
                          onChange={(e) => setVenueRequestAddress(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          disabled={venueRequestSubmitting || !venueRequestName.trim() || !venueRequestAddress.trim()}
                          onClick={async () => {
                            setVenueRequestSubmitting(true)
                            try {
                              const { data: sessionData } = await supabase.auth.getSession()
                              const accessToken = sessionData.session?.access_token
                              if (!accessToken) throw new Error('Not authenticated')
                              const currentUser = (await supabase.auth.getUser()).data.user
                              const { data: memberships } = await supabase
                                .from('community_members')
                                .select('community_id')
                                .eq('user_id', currentUser?.id || '')
                                .in('role', ['event_creator', 'co_admin', 'admin'])
                                .limit(1)
                              const communityId = (memberships || [])[0]?.community_id || null
                              const res = await fetch('/api/venues/request', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
                                body: JSON.stringify({ name: venueRequestName.trim(), address: venueRequestAddress.trim(), communityId }),
                              })
                              const json = await res.json()
                              if (!res.ok) throw new Error(json.error || 'Failed to submit venue')
                              setVenues(prev => [...prev, { id: json.venue.id, name: json.venue.name, address: json.venue.address }])
                              setFormData(prev => ({ ...prev, venue_id: json.venue.id }))
                              setShowVenueRequestForm(false)
                              setVenueRequestName('')
                              setVenueRequestAddress('')
                              toast.success('Venue submitted for review and selected for this event.')
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Failed to submit venue')
                            } finally { setVenueRequestSubmitting(false) }
                          }}
                        >
                          {venueRequestSubmitting ? 'Submitting…' : 'Submit Venue Request'}
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setShowVenueRequestForm(false); setVenueRequestName(''); setVenueRequestAddress('') }}>Cancel</Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Performer Settings ─────────────────────── */}
                <div className="border-t pt-4">
                  <h4 className="text-base font-semibold text-gray-800 mb-4">Performer Settings</h4>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Credits Req'd *
                    </label>
                    <input
                      type="number"
                      value={formData.credits_required}
                      onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                      min="0"
                      disabled={formData.event_type === 'booked_show'}
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
                      disabled={formData.event_type === 'booked_show'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.event_type === 'booked_show'
                        ? 'Not applicable for booked shows'
                        : formData.tickets_enabled
                          ? 'Not applicable for ticketed events'
                          : 'Hours before event to allow cancellation with refund'}
                    </p>
                  </div>
                </div>

                {formData.event_type === 'open_mic' && (
                  <div className="border-t pt-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
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
                          <label className="block text-sm font-medium text-gray-700 mb-2">Spot fee credits</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.spot_fee_credits}
                            onChange={(e) => setFormData({ ...formData, spot_fee_credits: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Coupon value (cents)</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.food_coupon_value_cents}
                            onChange={(e) => setFormData({ ...formData, food_coupon_value_cents: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Coupon expiry (hours)</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.food_coupon_expires_hours}
                            onChange={(e) => setFormData({ ...formData, food_coupon_expires_hours: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Multilingual + Open Registration stay under Performer Settings */}
                <div className="border-t pt-4 space-y-3">
                  <div className="space-y-2 rounded-lg border p-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.is_multilingual}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            is_multilingual: e.target.checked,
                            languages: e.target.checked ? formData.languages : ['English'],
                          })
                        }
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      Multilingual event
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Default language is English. Add more languages when multilingual is enabled.
                    </p>
                    {formData.is_multilingual && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={languageInput}
                            onChange={(e) => setLanguageInput(e.target.value)}
                            placeholder="Add language (free text)"
                            className="flex-1 px-3 py-2 border rounded-md text-sm"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addLanguageTag}>
                            Add
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {formData.languages.map((lang) => (
                            <span key={lang} className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs">
                              {lang}
                              {lang.toLowerCase() !== 'english' && (
                                <button type="button" onClick={() => removeLanguageTag(lang)} aria-label={`Remove ${lang}`}>
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {formData.event_type !== 'booked_show' && (
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
                )}

                {/* ── Audience Settings ──────────────────────── */}
                {formData.event_type !== 'booked_show' && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="text-base font-semibold text-gray-800">Audience Settings</h4>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.tickets_enabled}
                          onChange={(e) => {
                            const nextValue = e.target.checked
                            setFormData({
                              ...formData,
                              tickets_enabled: nextValue,
                              external_event: nextValue ? formData.external_event : false,
                              external_ticket_url: nextValue ? formData.external_ticket_url : '',
                              ticket_price: nextValue && formData.event_type === 'open_mic' && !formData.ticket_price
                                ? '5'
                                : formData.ticket_price,
                              ticket_quantity: nextValue && formData.event_type === 'open_mic' && !formData.ticket_quantity
                                ? (formData.audience_capacity || '15')
                                : formData.ticket_quantity,
                            })
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        Add tickets
                      </label>
                      {formData.tickets_enabled && (
                        <Button type="button" size="sm" variant="outline" onClick={() => setCreateStep('tickets')}>
                          Configure tickets
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                </>
                )}

                {createStep === 'tickets' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-900">Ticket Settings</h4>
                      <Button type="button" variant="outline" size="sm" onClick={() => setCreateStep('details')}>
                        Back
                      </Button>
                    </div>

                    {/* 1. Audience capacity */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Audience capacity
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.audience_capacity}
                        onChange={(e) => setFormData({ ...formData, audience_capacity: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    {/* 2. Ticket price (hidden for external events) */}
                    {!formData.external_event && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ticket price (CAD)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={formData.ticket_price}
                          onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                          placeholder="20.00"
                          disabled={formData.tickets_redeemable_credits_enabled}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* 3. Ticket quantity (hidden for external events) */}
                    {!formData.external_event && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Ticket quantity
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={Number(formData.audience_capacity) || undefined}
                          value={formData.ticket_quantity}
                          onChange={(e) => setFormData({ ...formData, ticket_quantity: e.target.value })}
                          placeholder="100"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {/* 4. Redeemable credits */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.tickets_redeemable_credits_enabled}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              tickets_redeemable_credits_enabled: e.target.checked,
                              tickets_redeemable_credits_amount: e.target.checked
                                ? (formData.tickets_redeemable_credits_amount || '5')
                                : '5',
                              ticket_price: e.target.checked ? '0' : formData.ticket_price,
                            })
                          }
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        Redeemable credits
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.tickets_redeemable_credits_amount}
                        onChange={(e) => setFormData({ ...formData, tickets_redeemable_credits_amount: e.target.value })}
                        disabled={!formData.tickets_redeemable_credits_enabled}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                      />
                    </div>

                    {/* 5. External event checkbox */}
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.external_event}
                        onChange={(e) => setFormData({ ...formData, external_event: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      External event (tickets sold elsewhere)
                    </label>

                    {/* 6. External ticket link (only when external_event is true) */}
                    {formData.external_event && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          External ticket link
                        </label>
                        <input
                          type="url"
                          value={formData.external_ticket_url}
                          onChange={(e) => setFormData({ ...formData, external_ticket_url: e.target.value })}
                          placeholder="https://tickets.example.com"
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}
                  </div>
                )}

                {createStep === 'variety' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-semibold text-gray-900">Variety Performance Types</h4>
                      <Button type="button" variant="outline" size="sm" onClick={() => setCreateStep('details')}>
                        Back
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Add up to 5 art types and choose slot limits for each.
                    </p>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.variety_use_max_attendees}
                        onChange={(e) => setFormData({ ...formData, variety_use_max_attendees: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      Use max attendees for all variety slots
                    </label>
                    <div className="space-y-2">
                      {varietyArtTypes.map((item, index) => (
                        <div key={`${item.id || 'new'}-${index}`} className="grid grid-cols-[1fr_140px_auto] gap-2">
                          <input
                            type="text"
                            value={item.art_type_name}
                            onChange={(e) => updateVarietyArtType(index, { art_type_name: e.target.value })}
                            placeholder="Art type (e.g. Spoken Word)"
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                          <input
                            type="number"
                            min="1"
                            value={item.slot_capacity}
                            onChange={(e) => updateVarietyArtType(index, { slot_capacity: e.target.value })}
                            disabled={formData.variety_use_max_attendees}
                            className="w-full px-3 py-2 border rounded-md text-sm"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={() => removeVarietyArtType(index)}>
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={addVarietyArtType}
                      disabled={varietyArtTypes.length >= 5}
                    >
                      Add Art Type
                    </Button>
                  </div>
                )}

                {createStep === 'details' && (
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
                        setCreateStep('details')
                        resetFormData()
                      }}
                      className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                )}
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
                    Event Type
                  </label>
                  <div className="flex items-center gap-4">
                    {[
                      { value: 'open_mic', label: 'Open Mic' },
                      { value: 'booked_show', label: 'Booked Show' },
                    ].map((option) => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="radio"
                          name="edit_event_type"
                          value={option.value}
                          checked={formData.event_type === option.value}
                          onChange={(e) => {
                            const nextType = e.target.value
                            setFormData({
                              ...formData,
                              event_type: nextType,
                              open_mic_type: nextType === 'open_mic' ? (formData.open_mic_type || 'comedy_open_mic') : null as any,
                              variety_use_max_attendees: nextType === 'open_mic' ? formData.variety_use_max_attendees : false,
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

                {formData.event_type === 'open_mic' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Open Mic Type
                    </label>
                    <div className="flex items-center gap-4">
                      {[
                        { value: 'comedy_open_mic', label: 'Comedy Open Mic' },
                        { value: 'variety_arts_open_mic', label: 'Variety Arts Open Mic' },
                      ].map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="radio"
                            name="edit_open_mic_type"
                            value={option.value}
                            checked={formData.open_mic_type === option.value}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                open_mic_type: e.target.value as any,
                                variety_use_max_attendees: e.target.value === 'variety_arts_open_mic'
                                  ? formData.variety_use_max_attendees
                                  : false,
                              })
                            }
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {formData.event_type === 'open_mic' && formData.open_mic_type === 'variety_arts_open_mic' && (
                  <div className="border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">Variety performance types</p>
                      <Button type="button" variant="outline" size="sm" onClick={() => setEditVarietyOpen((prev) => !prev)}>
                        {editVarietyOpen ? 'Hide' : 'Configure variety slots'}
                      </Button>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.variety_use_max_attendees}
                        onChange={(e) => setFormData({ ...formData, variety_use_max_attendees: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      Use max attendees for all variety slots
                    </label>
                    {editVarietyOpen && (
                      <div className="space-y-2">
                        {varietyArtTypes.map((item, index) => (
                          <div key={`${item.id || 'edit'}-${index}`} className="grid grid-cols-[1fr_140px_auto] gap-2">
                            <input
                              type="text"
                              value={item.art_type_name}
                              onChange={(e) => updateVarietyArtType(index, { art_type_name: e.target.value })}
                              placeholder="Art type"
                              className="w-full px-3 py-2 border rounded-md text-sm"
                            />
                            <input
                              type="number"
                              min="1"
                              value={item.slot_capacity}
                              onChange={(e) => updateVarietyArtType(index, { slot_capacity: e.target.value })}
                              disabled={formData.variety_use_max_attendees}
                              className="w-full px-3 py-2 border rounded-md text-sm"
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => removeVarietyArtType(index)}>
                              Remove
                            </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={addVarietyArtType}
                          disabled={varietyArtTypes.length >= 5}
                        >
                          Add Art Type
                        </Button>
                      </div>
                    )}
                  </div>
                )}

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

                {/* ── Performer Settings ─────────────────────── */}
                <div className="border-t pt-4">
                  <h4 className="text-base font-semibold text-gray-800 mb-4">Performer Settings</h4>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Credits Req'd *
                    </label>
                    <input
                      type="number"
                      value={formData.credits_required}
                      onChange={(e) => setFormData({ ...formData, credits_required: e.target.value })}
                      min="0"
                      disabled={formData.event_type === 'booked_show'}
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
                      disabled={formData.event_type === 'booked_show'}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.event_type === 'booked_show'
                        ? 'Not applicable for booked shows'
                        : formData.tickets_enabled
                          ? 'Not applicable for ticketed events'
                          : 'Hours before event to allow cancellation with refund'}
                    </p>
                  </div>
                </div>

                {/* Venue food coupon — performer setting (open_mic only) */}
                {formData.event_type === 'open_mic' && (
                  <div className="border-t pt-4 space-y-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
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
                          <label className="block text-sm font-medium text-gray-700 mb-2">Spot fee credits</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.spot_fee_credits}
                            onChange={(e) => setFormData({ ...formData, spot_fee_credits: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Coupon value (cents)</label>
                          <input
                            type="number"
                            min="0"
                            value={formData.food_coupon_value_cents}
                            onChange={(e) => setFormData({ ...formData, food_coupon_value_cents: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Coupon expiry (hours)</label>
                          <input
                            type="number"
                            min="1"
                            value={formData.food_coupon_expires_hours}
                            onChange={(e) => setFormData({ ...formData, food_coupon_expires_hours: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Multilingual + Open Registration — under Performer Settings */}
                <div className="border-t pt-4 space-y-3">
                  <div className="space-y-2 rounded-lg border p-3">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={formData.is_multilingual}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            is_multilingual: e.target.checked,
                            languages: e.target.checked ? formData.languages : ['English'],
                          })
                        }
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      Multilingual event
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Default language is English. Add more languages when multilingual is enabled.
                    </p>
                    {formData.is_multilingual && (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={languageInput}
                            onChange={(e) => setLanguageInput(e.target.value)}
                            placeholder="Add language (free text)"
                            className="flex-1 px-3 py-2 border rounded-md text-sm"
                          />
                          <Button type="button" variant="outline" size="sm" onClick={addLanguageTag}>
                            Add
                          </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {formData.languages.map((lang) => (
                            <span key={lang} className="inline-flex items-center gap-2 rounded-full border px-2 py-1 text-xs">
                              {lang}
                              {lang.toLowerCase() !== 'english' && (
                                <button type="button" onClick={() => removeLanguageTag(lang)} aria-label={`Remove ${lang}`}>
                                  ×
                                </button>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {formData.event_type !== 'booked_show' && (
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
                )}

                {/* ── Audience Settings ──────────────────────── */}
                {formData.event_type !== 'booked_show' && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="text-base font-semibold text-gray-800">Audience Settings</h4>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={formData.tickets_enabled}
                          onChange={(e) => {
                            const nextValue = e.target.checked
                            setFormData({
                              ...formData,
                              tickets_enabled: nextValue,
                              external_event: nextValue ? formData.external_event : false,
                              external_ticket_url: nextValue ? formData.external_ticket_url : '',
                              ticket_price: nextValue && formData.event_type === 'open_mic' && !formData.ticket_price
                                ? '5'
                                : formData.ticket_price,
                              ticket_quantity: nextValue && formData.event_type === 'open_mic' && !formData.ticket_quantity
                                ? (formData.audience_capacity || '15')
                                : formData.ticket_quantity,
                            })
                            if (!nextValue) setEditTicketsOpen(false)
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                        />
                        Add tickets
                      </label>

                      {formData.tickets_enabled && !editTicketsOpen && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditTicketsOpen(true)}
                        >
                          Configure tickets
                        </Button>
                      )}
                    </div>

                    {formData.tickets_enabled && editTicketsOpen && (
                      <div className="space-y-4 pt-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-lg font-semibold text-gray-900">Ticket Settings</h4>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditTicketsOpen(false)}
                          >
                            Back
                          </Button>
                        </div>

                        {/* 1. Audience capacity */}
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Audience capacity
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formData.audience_capacity}
                            onChange={(e) => setFormData({ ...formData, audience_capacity: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>

                        {/* 2. Ticket price (hidden for external events) */}
                        {!formData.external_event && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Ticket price (CAD)
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={formData.ticket_price}
                              onChange={(e) => setFormData({ ...formData, ticket_price: e.target.value })}
                              placeholder="20.00"
                              disabled={formData.tickets_redeemable_credits_enabled}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        )}

                        {/* 3. Ticket quantity (hidden for external events) */}
                        {!formData.external_event && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Ticket quantity
                            </label>
                            <input
                              type="number"
                              min="1"
                              max={Number(formData.audience_capacity) || undefined}
                              value={formData.ticket_quantity}
                              onChange={(e) => setFormData({ ...formData, ticket_quantity: e.target.value })}
                              placeholder="100"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        )}

                        {/* 4. Redeemable credits */}
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={formData.tickets_redeemable_credits_enabled}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  tickets_redeemable_credits_enabled: e.target.checked,
                                  tickets_redeemable_credits_amount: e.target.checked
                                    ? (formData.tickets_redeemable_credits_amount || '5')
                                    : '5',
                                  ticket_price: e.target.checked ? '0' : formData.ticket_price,
                                })
                              }
                              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                            />
                            Redeemable credits
                          </label>
                          <input
                            type="number"
                            min="0"
                            value={formData.tickets_redeemable_credits_amount}
                            onChange={(e) =>
                              setFormData({ ...formData, tickets_redeemable_credits_amount: e.target.value })
                            }
                            disabled={!formData.tickets_redeemable_credits_enabled}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
                          />
                        </div>

                        {/* 5. External event checkbox */}
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={formData.external_event}
                            onChange={(e) => setFormData({ ...formData, external_event: e.target.checked })}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                          />
                          External event (tickets sold elsewhere)
                        </label>

                        {/* 6. External ticket link (only when external_event is true) */}
                        {formData.external_event && (
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              External ticket link
                            </label>
                            <input
                              type="url"
                              value={formData.external_ticket_url}
                              onChange={(e) => setFormData({ ...formData, external_ticket_url: e.target.value })}
                              placeholder="https://tickets.example.com"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

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
