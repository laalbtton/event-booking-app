'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import NavigationTabs from '@/components/NavigationTabs'
import { formatDateTime } from '@/lib/dateUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { cn } from '@/lib/utils'

type VenueOption = {
  id: string
  name: string
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

type VoucherPreview = {
  id: string
  code: string
  eventId: string
  eventTitle: string
  attendeeName: string
  attendeeEmail: string | null
  valueCents: number
  status: string
  expiresAt: string | null
  canRedeem: boolean
}

type IssuedVoucherRow = {
  id: string
  eventId: string
  eventTitle: string
  eventDate: string | null
  attendeeName: string
  attendeeEmail: string | null
  code: string
  valueCents: number
  status: string
  expiresAt: string | null
}

type UnredeemedIssuedTotals = {
  count: number
  totalValueCents: number
}

type ScannerEngine = 'native' | 'html5' | null

export default function VenueRedemptionsPage() {
  const router = useRouter()
  const { confirm } = useConfirmDialog()

  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [selectedEventId, setSelectedEventId] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [rows, setRows] = useState<RedemptionRow[]>([])
  const [listLoading, setListLoading] = useState(false)

  const [redeemCode, setRedeemCode] = useState('')
  const [redeemOrderTotal, setRedeemOrderTotal] = useState('')
  const [redeemNotes, setRedeemNotes] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemMessage, setRedeemMessage] = useState('')
  const [redeemError, setRedeemError] = useState('')
  const [redeemPreview, setRedeemPreview] = useState<VoucherPreview | null>(null)
  const [issuedVouchers, setIssuedVouchers] = useState<IssuedVoucherRow[]>([])
  const [issuedLoading, setIssuedLoading] = useState(false)
  const [issuedSearch, setIssuedSearch] = useState('')
  const [unredeemedIssuedTotals, setUnredeemedIssuedTotals] = useState<UnredeemedIssuedTotals>({
    count: 0,
    totalValueCents: 0,
  })
  const [activeTab, setActiveTab] = useState<'redeem' | 'history'>('redeem')

  const [scannerActive, setScannerActive] = useState(false)
  const [scannerSupported, setScannerSupported] = useState(true)
  const [scannerMessage, setScannerMessage] = useState('')
  const [scannerEngine, setScannerEngine] = useState<ScannerEngine>(null)
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null)
  const scannerStreamRef = useRef<MediaStream | null>(null)
  const scannerIntervalRef = useRef<number | null>(null)
  const html5ScannerRef = useRef<any>(null)
  const html5ScannerElementId = 'venue-redemptions-qr-reader'

  useEffect(() => {
    checkAccessAndLoad()
    return () => {
      stopScanner()
    }
  }, [])

  useEffect(() => {
    if (selectedVenueId) {
      loadEventsForVenue(selectedVenueId)
      loadRedemptions(selectedVenueId, selectedEventId)
      loadIssuedVouchers(selectedVenueId, selectedEventId, issuedSearch)
      loadUnredeemedIssuedTotals(selectedVenueId, selectedEventId)
    }
  }, [selectedVenueId, selectedEventId, fromDate, toDate, issuedSearch])

  async function checkAccessAndLoad() {
    setLoading(true)
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) {
      router.push('/login')
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const admin = profile?.role === 'admin' || !!adminRow
    setIsAdmin(admin)

    if (admin) {
      const { data: allVenues } = await supabase
        .from('venues')
        .select('id, name')
        .order('name', { ascending: true })
      const mapped = (allVenues || []) as VenueOption[]
      setVenues(mapped)
      if (mapped.length > 0) setSelectedVenueId(mapped[0].id)
      setLoading(false)
      return
    }

    const { data: memberships } = await supabase
      .from('venue_staff')
      .select('venue_id, active, venues:venue_id(id, name)')
      .eq('user_id', user.id)
      .eq('active', true)

    const allowed = (memberships || [])
      .map((m: any) => m.venues)
      .filter(Boolean)
      .map((v: any) => ({ id: v.id as string, name: v.name as string }))

    if (allowed.length === 0) {
      router.push('/dashboard')
      return
    }

    setVenues(allowed)
    setSelectedVenueId(allowed[0].id)
    setLoading(false)
  }

  async function loadEventsForVenue(venueId: string) {
    const { data } = await supabase
      .from('events')
      .select('id, title, date')
      .eq('venue_id', venueId)
      .order('date', { ascending: false })
      .limit(200)
    setEvents((data || []) as EventOption[])
  }

  async function loadRedemptions(venueId: string, eventId: string) {
    setListLoading(true)
    setRows([])
    let vouchersQuery = supabase
      .from('booking_vouchers')
      .select('id, event_id, user_id, venue_id')
      .eq('venue_id', venueId)

    if (eventId !== 'all') {
      vouchersQuery = vouchersQuery.eq('event_id', eventId)
    }

    const { data: vouchers, error: vouchersError } = await vouchersQuery
    if (vouchersError) {
      setListLoading(false)
      return
    }

    const voucherList = vouchers || []
    if (voucherList.length === 0) {
      setListLoading(false)
      return
    }

    const voucherIds = voucherList.map((v) => v.id)
    const voucherMap = new Map(voucherList.map((v) => [v.id, v]))
    const userIds = Array.from(new Set(voucherList.map((v: any) => v.user_id).filter(Boolean)))

    let redemptionsQuery = supabase
      .from('voucher_redemptions')
      .select('id, voucher_id, event_id, created_at, discount_cents, order_total_cents, notes')
      .in('voucher_id', voucherIds)

    if (fromDate) {
      redemptionsQuery = redemptionsQuery.gte('created_at', new Date(fromDate).toISOString())
    }
    if (toDate) {
      redemptionsQuery = redemptionsQuery.lte('created_at', new Date(toDate).toISOString())
    }

    const { data: redemptions, error: redemptionsError } = await redemptionsQuery
      .order('created_at', { ascending: false })
      .limit(300)

    if (redemptionsError || !redemptions) {
      setListLoading(false)
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

    setRows(mapped)
    setListLoading(false)
  }

  async function loadIssuedVouchers(venueId: string, eventId: string, query: string) {
    setIssuedLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const params = new URLSearchParams({
        venueId,
        eventId: eventId || 'all',
      })
      if (query.trim()) params.set('q', query.trim())

      const response = await fetch(`/api/vouchers/issued?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to load issued coupons')

      setIssuedVouchers((data.vouchers || []) as IssuedVoucherRow[])
    } catch {
      setIssuedVouchers([])
    } finally {
      setIssuedLoading(false)
    }
  }

  async function loadUnredeemedIssuedTotals(venueId: string, eventId: string) {
    try {
      let query = supabase
        .from('booking_vouchers')
        .select('id, value_cents')
        .eq('venue_id', venueId)
        .eq('status', 'issued')

      if (eventId !== 'all') {
        query = query.eq('event_id', eventId)
      }

      const { data } = await query.limit(1000)
      const rows = data || []
      const totalValueCents = rows.reduce((sum: number, row: any) => sum + Number(row.value_cents || 0), 0)
      setUnredeemedIssuedTotals({ count: rows.length, totalValueCents })
    } catch {
      setUnredeemedIssuedTotals({ count: 0, totalValueCents: 0 })
    }
  }

  async function lookupVoucher(inputCode?: string): Promise<VoucherPreview | null> {
    const code = (inputCode || redeemCode).trim().toUpperCase()
    if (!code) {
      setRedeemPreview(null)
      return null
    }
    setRedeemError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const params = new URLSearchParams({ code })
      if (selectedEventId !== 'all') {
        params.set('eventId', selectedEventId)
      }

      const response = await fetch(`/api/vouchers/lookup?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to lookup coupon')

      const preview = data.voucher as VoucherPreview
      setRedeemPreview(preview)
      setRedeemCode(preview.code)
      setRedeemOrderTotal((Math.max(0, Number(preview.valueCents || 0)) / 100).toFixed(2))
      return preview
    } catch (error: any) {
      setRedeemPreview(null)
      setRedeemError(error.message || 'Failed to lookup coupon')
      return null
    }
  }

  function stopScanner() {
    if (scannerIntervalRef.current) {
      window.clearInterval(scannerIntervalRef.current)
      scannerIntervalRef.current = null
    }
    if (scannerStreamRef.current) {
      scannerStreamRef.current.getTracks().forEach((track) => track.stop())
      scannerStreamRef.current = null
    }
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null
    }
    if (html5ScannerRef.current) {
      const scanner = html5ScannerRef.current
      html5ScannerRef.current = null
      void scanner.stop().catch(() => undefined).finally(() => {
        void scanner.clear().catch(() => undefined)
      })
    }
    setScannerEngine(null)
    setScannerActive(false)
  }

  async function startHtml5Scanner() {
    setScannerSupported(true)
    setScannerEngine('html5')
    setScannerActive(true)
    setScannerMessage('Starting camera scanner...')

    // Ensure the scanner container is mounted before constructing Html5Qrcode.
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    const { Html5Qrcode } = await import('html5-qrcode')
    const scanner = new Html5Qrcode(html5ScannerElementId)
    html5ScannerRef.current = scanner
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
      (decodedText: string) => {
        if (!decodedText) return
        const code = decodedText.trim()
        stopScanner()
        void redeemCoupon(code)
      },
      () => undefined
    )
    setScannerMessage('Scanner is active. Point camera at coupon QR code.')
  }

  async function startScanner() {
    setScannerMessage('')
    setRedeemError('')

    const DetectorCtor = (window as any).BarcodeDetector
    if (DetectorCtor) {
      try {
        setScannerSupported(true)
        setScannerEngine('native')
        setScannerActive(true)
        setScannerMessage('Starting camera scanner...')

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        })
        scannerStreamRef.current = stream
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream
          await scannerVideoRef.current.play().catch(() => undefined)
        }

        const detector = new DetectorCtor({ formats: ['qr_code'] })
        scannerIntervalRef.current = window.setInterval(async () => {
          try {
            if (!scannerVideoRef.current) return
            const barcodes = await detector.detect(scannerVideoRef.current)
            if (!barcodes?.length) return
            const rawValue = barcodes[0]?.rawValue
            if (!rawValue) return
            const code = rawValue.trim()
            stopScanner()
            void redeemCoupon(code)
          } catch {
            // Keep polling.
          }
        }, 500)

        setScannerMessage('Scanner is active. Point camera at coupon QR code.')
        return
      } catch {
        stopScanner()
      }
    }

    try {
      await startHtml5Scanner()
    } catch (error: any) {
      stopScanner()
      setScannerSupported(false)
      setScannerMessage(error?.message || 'Could not start camera scanner. Use manual code entry.')
    }
  }

  async function redeemCoupon(codeOverride?: string) {
    const codeToRedeem = (codeOverride || redeemCode).trim().toUpperCase()
    if (!codeToRedeem) {
      setRedeemError('Enter a coupon code to redeem.')
      return
    }
    setRedeemLoading(true)
    setRedeemError('')
    setRedeemMessage('')
    setRedeemCode(codeToRedeem)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const parsedOrderTotal = redeemOrderTotal.trim()
        ? Math.round(Number(redeemOrderTotal) * 100)
        : undefined
      if (parsedOrderTotal !== undefined && (Number.isNaN(parsedOrderTotal) || parsedOrderTotal < 0)) {
        throw new Error('Order total must be a valid non-negative amount.')
      }

      const preview = redeemPreview?.code === codeToRedeem ? redeemPreview : (await lookupVoucher(codeToRedeem))
      if (!preview) {
        throw new Error('Please lookup a valid coupon first')
      }
      if (!preview.canRedeem) {
        throw new Error('This coupon is not redeemable in its current state')
      }

      const amountText = `$${(Math.max(0, Number(preview.valueCents || 0)) / 100).toFixed(2)}`
      const shouldRedeem = await confirm({
        title: 'Confirm coupon redemption',
        message: `Redeem ${amountText} for ${preview.attendeeName}?\n\nCoupon: ${preview.code}`,
        confirmText: `Redeem ${amountText}`,
        cancelText: 'Cancel',
      })
      if (!shouldRedeem) {
        setRedeemLoading(false)
        return
      }

      const response = await fetch('/api/vouchers/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          code: codeToRedeem,
          orderTotalCents: parsedOrderTotal,
          notes: redeemNotes.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Failed to redeem coupon')

      setRedeemMessage(`Coupon redeemed. Discount: $${(Number(data.discountCents || 0) / 100).toFixed(2)}.`)
      setRedeemCode('')
      setRedeemOrderTotal('')
      setRedeemNotes('')
      setRedeemPreview(null)
      if (selectedVenueId) {
        await loadRedemptions(selectedVenueId, selectedEventId)
        await loadIssuedVouchers(selectedVenueId, selectedEventId, issuedSearch)
        await loadUnredeemedIssuedTotals(selectedVenueId, selectedEventId)
      }
    } catch (error: any) {
      setRedeemError(error.message || 'Failed to redeem coupon')
    } finally {
      setRedeemLoading(false)
    }
  }

  const totals = useMemo(() => {
    const totalDiscount = rows.reduce((sum, row) => sum + row.discount_cents, 0)
    const totalOrders = rows.reduce((sum, row) => sum + (row.order_total_cents || 0), 0)
    return {
      count: rows.length,
      totalDiscount,
      totalOrders,
    }
  }, [rows])

  const sortedIssuedVouchers = useMemo(() => {
    const order = (status: string) => {
      if (status === 'issued') return 0
      if (status === 'redeemed') return 1
      if (status === 'cancelled') return 2
      return 3
    }
    return [...issuedVouchers].sort((a, b) => {
      const byStatus = order(a.status) - order(b.status)
      if (byStatus !== 0) return byStatus
      return a.attendeeName.localeCompare(b.attendeeName)
    })
  }, [issuedVouchers])

  const eventSummaries = useMemo(() => {
    const map = new Map<string, { eventTitle: string; eventDate: string; count: number; totalDiscount: number }>()
    rows.forEach((row) => {
      const existing = map.get(row.event_id)
      if (existing) {
        existing.count += 1
        existing.totalDiscount += row.discount_cents
      } else {
        map.set(row.event_id, {
          eventTitle: row.event_title,
          eventDate: row.event_date,
          count: 1,
          totalDiscount: row.discount_cents,
        })
      }
    })
    return Array.from(map.values()).sort((a, b) => b.totalDiscount - a.totalDiscount)
  }, [rows])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-2xl">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Venue Coupon Redemptions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Venue</Label>
                <select
                  value={selectedVenueId}
                  onChange={(e) => {
                    setSelectedVenueId(e.target.value)
                    setSelectedEventId('all')
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
                  value={selectedEventId}
                  onChange={(e) => setSelectedEventId(e.target.value)}
                  className="w-full h-10 px-3 border border-input bg-background rounded-md"
                >
                  <option value="all">All events</option>
                  {events.map((event) => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'redeem' | 'history')} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="redeem">Redeem</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="redeem" className="space-y-6 mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Redeem Coupon</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Coupon code</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={redeemCode}
                  onChange={(e) => {
                    setRedeemCode(e.target.value)
                    setRedeemPreview(null)
                  }}
                  placeholder="LB-XXXXXXXX"
                />
                <Button type="button" variant="outline" onClick={() => lookupVoucher()} disabled={!redeemCode.trim()}>
                  Lookup
                </Button>
              </div>
            </div>
            {redeemPreview && (
              <div className="rounded-md border p-3 text-sm bg-muted/30">
                <p className="font-medium">{redeemPreview.attendeeName}</p>
                <p className="text-xs text-muted-foreground">{redeemPreview.code} • {redeemPreview.eventTitle}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">${(redeemPreview.valueCents / 100).toFixed(2)}</Badge>
                  <Badge variant={redeemPreview.canRedeem ? 'secondary' : 'destructive'}>
                    {redeemPreview.canRedeem ? 'Ready to redeem' : redeemPreview.status}
                  </Badge>
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              {!scannerActive ? (
                <Button type="button" variant="outline" size="sm" onClick={startScanner}>
                  Scan QR with camera
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={stopScanner}>
                  Stop scanner
                </Button>
              )}
              {!scannerSupported && (
                <span className="text-xs text-muted-foreground">QR scanning unavailable on this browser</span>
              )}
            </div>
            {scannerActive && (
              <div className="rounded-lg border p-2 bg-black/5">
                {scannerEngine === 'native' && (
                  <video
                    ref={scannerVideoRef}
                    className="w-full rounded-md max-h-64 min-h-40 object-cover bg-black"
                    playsInline
                    muted
                    autoPlay
                  />
                )}
                {scannerEngine === 'html5' && (
                  <div id={html5ScannerElementId} className="w-full" />
                )}
              </div>
            )}
            {scannerMessage && <p className="text-xs text-muted-foreground">{scannerMessage}</p>}
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Coupon amount (auto-filled)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={redeemOrderTotal}
                  onChange={(e) => setRedeemOrderTotal(e.target.value)}
                  disabled
                />
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Input value={redeemNotes} onChange={(e) => setRedeemNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={() => void redeemCoupon()} disabled={redeemLoading}>
                {redeemLoading ? 'Redeeming...' : 'Redeem coupon'}
              </Button>
              {redeemMessage && <span className="text-sm text-green-700">{redeemMessage}</span>}
              {redeemError && <span className="text-sm text-red-600">{redeemError}</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Issued Coupons</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                value={issuedSearch}
                onChange={(e) => setIssuedSearch(e.target.value)}
                placeholder="Search attendee name or email"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => selectedVenueId && loadIssuedVouchers(selectedVenueId, selectedEventId, issuedSearch)}
                disabled={!selectedVenueId}
              >
                Refresh
              </Button>
            </div>
            {issuedLoading ? (
              <p className="text-sm text-muted-foreground">Loading issued coupons...</p>
            ) : sortedIssuedVouchers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No coupons found for this scope.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-auto pr-1">
                {sortedIssuedVouchers.map((voucher) => (
                  <div
                    key={voucher.id}
                    className={cn(
                      'flex items-center justify-between gap-3 border rounded-md p-2',
                      voucher.status === 'redeemed'
                        ? 'border-green-300 bg-green-50/60'
                        : 'border-red-300 bg-red-50/60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{voucher.attendeeName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {voucher.eventTitle}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">${(voucher.valueCents / 100).toFixed(2)}</Badge>
                      <span
                        className={cn(
                          'inline-flex h-6 w-6 items-center justify-center rounded-full border text-sm font-bold',
                          voucher.status === 'redeemed' && 'text-green-700 border-green-600 bg-green-100',
                          voucher.status === 'issued' && 'text-red-700 border-red-600 bg-red-100',
                          voucher.status === 'cancelled' && 'text-red-700 border-red-600 bg-red-100',
                          voucher.status !== 'redeemed' &&
                            voucher.status !== 'issued' &&
                            voucher.status !== 'cancelled' &&
                            'text-muted-foreground border-muted'
                        )}
                        title={voucher.status}
                      >
                        {voucher.status === 'cancelled' ? 'x' : '✓'}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setRedeemCode(voucher.code)
                          void lookupVoucher(voucher.code)
                        }}
                      >
                        Select
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="history" className="space-y-6 mt-0">
        <Card>
          <CardHeader>
            <CardTitle>Redemption History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>From</Label>
                <Input type="datetime-local" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div>
                <Label>To</Label>
                <Input type="datetime-local" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Redemptions</p>
                  <p className="text-2xl font-semibold">{totals.count}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Total Discount</p>
                  <p className="text-2xl font-semibold">${(totals.totalDiscount / 100).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Order Total Captured</p>
                  <p className="text-2xl font-semibold">${(totals.totalOrders / 100).toFixed(2)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">Issued Not Redeemed</p>
                  <p className="text-2xl font-semibold">{unredeemedIssuedTotals.count}</p>
                  <p className="text-xs text-muted-foreground">
                    ${ (unredeemedIssuedTotals.totalValueCents / 100).toFixed(2) } total value
                  </p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Totals</CardTitle>
          </CardHeader>
          <CardContent>
            {eventSummaries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No redeemed coupons in this scope.</p>
            ) : (
              <div className="space-y-2">
                {eventSummaries.map((summary) => (
                  <div key={`${summary.eventTitle}-${summary.eventDate}`} className="flex items-center justify-between gap-3 border rounded-md p-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{summary.eventTitle}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(summary.eventDate)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${(summary.totalDiscount / 100).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground">{summary.count} redeemed</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Redemption Log</CardTitle>
          </CardHeader>
          <CardContent>
            {listLoading ? (
              <p className="text-sm text-muted-foreground">Loading redemptions...</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No redemptions found for current filters.</p>
            ) : (
              <div className="space-y-2">
                {rows.map((row) => (
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

        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            Admin view: showing scoped venue redemptions with full venue selection.
          </p>
        )}
      </div>

      <NavigationTabs />
    </div>
  )
}
