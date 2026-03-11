'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/dateUtils'
import { toast } from 'sonner'
import { Download, Mail } from 'lucide-react'

type EventCreditsReportRow = {
  eventId: string
  eventTitle: string
  eventDate: string
  venueName: string | null
  venueVouchersTotalCents: number | null
  totalCreditsUsed: number
  bookingCount: number
  purchasedCreditsUsed: number | null
  complimentaryCreditsUsed: number | null
  venueCreditsPurchased: number | null
  moneySpentCad: number | null
}

function rowsToCsv(rows: EventCreditsReportRow[]): string {
  if (rows.length === 0) return ''
  const headers = ['Event ID', 'Event Title', 'Event Date', 'Venue', 'Venue Credits', 'Total Credits Used', 'Booking Count', 'Purchased', 'Complimentary']
  const escape = (v: unknown) => {
    const s = String(v ?? '—')
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push([
      row.eventId,
      row.eventTitle,
      row.eventDate,
      row.venueName ?? '—',
      row.venueVouchersTotalCents != null && row.venueVouchersTotalCents > 0
        ? `$${(row.venueVouchersTotalCents / 100).toFixed(2)}`
        : '—',
      row.totalCreditsUsed,
      row.bookingCount,
      row.purchasedCreditsUsed ?? '—',
      row.complimentaryCreditsUsed ?? '—',
    ].map(escape).join(','))
  }
  return lines.join('\n')
}

export default function AdminCreditsReportPage() {
  const [rows, setRows] = useState<EventCreditsReportRow[]>([])
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [venueId, setVenueId] = useState('')
  const [emailSending, setEmailSending] = useState(false)
  const [emailTo, setEmailTo] = useState('')

  useEffect(() => {
    async function loadVenues() {
      const { data } = await supabase.from('venues').select('id, name').order('name')
      setVenues(data || [])
    }
    loadVenues()
  }, [])

  useEffect(() => {
    loadReport()
  }, [])

  async function loadReport() {
    setLoading(true)
    setError('')
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const params = new URLSearchParams()
      if (fromDate) params.set('fromDate', fromDate)
      if (toDate) params.set('toDate', toDate)
      if (venueId) params.set('venueId', venueId)

      const res = await fetch(`/api/admin/event-credits-report?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to load report')

      setRows(data.rows || [])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load report')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  function handleDownloadCsv() {
    const csv = rowsToCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `event-credits-report-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Report downloaded')
  }

  async function handleEmailReport() {
    const email = emailTo.trim() || undefined
    setEmailSending(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch(`/api/admin/event-credits-report/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: email || null, fromDate, toDate, venueId: venueId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Failed to send email')

      toast.success(`Report sent to ${data.sentTo || email || 'your email'}`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send email')
    } finally {
      setEmailSending(false)
    }
  }

  const totalCredits = rows.reduce((s, r) => s + r.totalCreditsUsed, 0)
  const totalBookings = rows.reduce((s, r) => s + r.bookingCount, 0)
  const totalMoneySpent = rows.reduce((s, r) => s + (r.moneySpentCad ?? 0), 0)

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Credits Report</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Total credits used per event. Purchased credits = $1 CAD each. When a user has both purchased and complimentary credits, purchased are consumed first.
        </p>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-red-600">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>From date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div>
              <Label>To date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div>
              <Label>Venue</Label>
              <select
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">All venues</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={loadReport}>Apply filters</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Credits Used</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalCredits}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Bookings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalBookings}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rows.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Money Spent (CAD)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMoneySpent > 0 ? `$${totalMoneySpent}` : '—'}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Report</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadCsv} disabled={rows.length === 0}>
              <Download className="w-4 h-4 mr-2" />
              Download CSV
            </Button>
            <div className="flex items-center gap-2">
              <Input
                type="email"
                placeholder="Email address"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                className="w-48"
              />
              <Button size="sm" onClick={handleEmailReport} disabled={emailSending || rows.length === 0}>
                <Mail className="w-4 h-4 mr-2" />
                {emailSending ? 'Sending...' : 'Email report'}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Venue Credits</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Credits Used</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Bookings</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Purchased</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Complimentary</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.eventId} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm font-medium">{row.eventTitle}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{formatDateTime(row.eventDate)}</td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{row.venueName ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-right text-muted-foreground">
                      {row.venueVouchersTotalCents != null && row.venueVouchersTotalCents > 0
                        ? `$${(row.venueVouchersTotalCents / 100).toFixed(2)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right">{row.totalCreditsUsed}</td>
                    <td className="px-4 py-2 text-sm text-right">{row.bookingCount}</td>
                    <td className="px-4 py-2 text-sm text-right text-muted-foreground">{row.purchasedCreditsUsed ?? '—'}</td>
                    <td className="px-4 py-2 text-sm text-right text-muted-foreground">{row.complimentaryCreditsUsed ?? '—'}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No events with credit usage in this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
