'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { CreditTransaction } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'
import { CreditHistorySkeleton } from '@/components/skeletons/CreditHistorySkeleton'

type VenueGrant = {
  id: string
  credits_total: number
  credits_remaining: number
  notes: string | null
  issued_at: string
  expires_at: string | null
  venue_name: string
  venue_id: string
}

export default function CreditsHistoryPage() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)
  const [activeGrants, setActiveGrants] = useState<VenueGrant[]>([])
  const [pastGrants, setPastGrants] = useState<VenueGrant[]>([])
  const [showPastGrants, setShowPastGrants] = useState(false)
  const [venueNameById, setVenueNameById] = useState<Record<string, string>>({})

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const { data: authData } = await supabase.auth.getUser()
        if (!authData.user) {
          setError('Please log in to view credits history.')
          setLoading(false)
          return
        }

        const now = new Date().toISOString()

        // Fetch profile balance, transactions, and venue grants in parallel
        const [profileResult, transactionsResult, grantsResult] = await Promise.all([
          supabase.from('profiles').select('credits').eq('id', authData.user.id).single(),
          supabase
            .from('credit_transactions')
            .select('*')
            .eq('user_id', authData.user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('venue_credit_grants')
            .select('id, credits_total, credits_remaining, notes, issued_at, expires_at, venue_id')
            .eq('user_id', authData.user.id)
            .order('issued_at', { ascending: false }),
        ])

        if (profileResult.error) throw profileResult.error
        if (transactionsResult.error) throw transactionsResult.error

        setCurrentBalance(profileResult.data?.credits ?? null)
        setTransactions(transactionsResult.data || [])

        // Fetch venue names
        const grants = (grantsResult.data ?? []) as Array<{
          id: string; credits_total: number; credits_remaining: number
          notes: string | null; issued_at: string; expires_at: string | null; venue_id: string
        }>
        const venueIds = [...new Set(grants.map((g) => g.venue_id).filter(Boolean))]
        let nameMap: Record<string, string> = {}
        if (venueIds.length > 0) {
          const { data: venueRows } = await supabase
            .from('venues')
            .select('id, name')
            .in('id', venueIds)
          for (const v of venueRows ?? []) {
            nameMap[v.id] = v.name ?? ''
          }
        }
        setVenueNameById(nameMap)

        const active: VenueGrant[] = []
        const past: VenueGrant[] = []
        for (const g of grants) {
          const expired = g.expires_at ? new Date(g.expires_at) <= new Date() : false
          const spent = g.credits_remaining === 0
          const row: VenueGrant = { ...g, venue_name: nameMap[g.venue_id] ?? 'Venue' }
          if (!expired && !spent) active.push(row)
          else past.push(row)
        }
        setActiveGrants(active)
        setPastGrants(past)
      } catch (err: any) {
        setError(err.message || 'Unable to load credits history.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  return (
    <div className="min-h-screen bg-background py-6 sm:py-8 px-4 pb-20">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to Dashboard">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Credits</h1>
            <p className="text-sm text-muted-foreground">
              Track purchases, refunds, and bookings.
            </p>
          </div>
        </div>

        <Card className="border-yellow-400/30 bg-yellow-400/10 shadow-sm">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm text-yellow-700 dark:text-yellow-400">Current balance</p>
              <p className="text-2xl font-bold text-stone-900 dark:text-stone-100">{currentBalance ?? '--'} credits</p>
            </div>
            <Link
              href="/buy-credits"
              className="text-sm font-semibold text-yellow-600 hover:text-yellow-500 underline underline-offset-4"
            >
              Buy more credits
            </Link>
          </CardContent>
        </Card>

        {/* ── Venue Passes ─────────────────────────────────────────── */}
        {!loading && (activeGrants.length > 0 || pastGrants.length > 0) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                🏟 Venue passes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {activeGrants.length === 0 && (
                <p className="text-sm text-muted-foreground">No active venue passes right now.</p>
              )}
              {activeGrants.map((g) => (
                <div
                  key={g.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <Link href={`/venues/${g.venue_id}`} className="font-medium hover:underline">
                      {g.venue_name}
                    </Link>
                    {g.notes && <p className="text-xs text-muted-foreground italic mt-0.5">{g.notes}</p>}
                  </div>
                  <div className="shrink-0 text-right space-y-0.5">
                    <p className="font-semibold tabular-nums">
                      {g.credits_remaining}
                      <span className="text-muted-foreground font-normal"> / {g.credits_total} cr</span>
                    </p>
                    {g.expires_at && (
                      <p className="text-xs text-muted-foreground">
                        Expires {new Date(g.expires_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {pastGrants.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowPastGrants((v) => !v)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2"
                  >
                    {showPastGrants ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showPastGrants ? 'Hide' : 'Show'} past passes ({pastGrants.length})
                  </button>
                  {showPastGrants && (
                    <div className="mt-2 space-y-1.5">
                      {pastGrants.map((g) => {
                        const expired = g.expires_at ? new Date(g.expires_at) <= new Date() : false
                        return (
                          <div
                            key={g.id}
                            className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-muted/30 px-3 py-2 text-sm opacity-60"
                          >
                            <div className="min-w-0">
                              <p className="font-medium">{g.venue_name}</p>
                              {g.notes && <p className="text-xs text-muted-foreground italic">{g.notes}</p>}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="tabular-nums">
                                {g.credits_remaining} / {g.credits_total} cr
                              </p>
                              <Badge variant="secondary" className="text-xs">
                                {expired ? 'Expired' : 'Fully used'}
                              </Badge>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <CreditHistorySkeleton />
        ) : error ? (
          <Card className="border-red-200 bg-red-50/50">
            <CardContent className="p-6 text-sm text-red-700">{error}</CardContent>
          </Card>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">No credit activity yet.</CardContent>
          </Card>
        ) : (
          (() => {
            const rows = [...transactions]
            rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

            let runningBalance = currentBalance ?? 0
            const rowsWithBalance = rows.map((row) => {
              const balance = runningBalance
              runningBalance = balance - row.amount
              return { ...row, balance }
            })

            const formatActivityDate = (value: string) =>
              new Date(value).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })

            const grouped = rowsWithBalance.reduce((acc: Record<string, typeof rowsWithBalance>, row) => {
              const key = formatActivityDate(row.created_at)
              if (!acc[key]) acc[key] = []
              acc[key].push(row)
              return acc
            }, {})

            const orderedDates: string[] = []
            rowsWithBalance.forEach((row) => {
              const key = formatActivityDate(row.created_at)
              if (!orderedDates.includes(key)) {
                orderedDates.push(key)
              }
            })

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-border text-sm">
                      <tbody className="divide-y divide-border">
                        {orderedDates.flatMap((groupDate) => [
                          (
                            <tr key={`${groupDate}-header`}>
                              <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-muted-foreground bg-muted/30">
                                {groupDate}
                              </td>
                            </tr>
                          ),
                          ...(grouped[groupDate] || []).map((row) => {
                            const isPositive = row.amount > 0
                            return (
                              <tr key={row.id} className="hover:bg-muted/30">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <div className="font-medium text-foreground truncate max-w-[220px] sm:max-w-[320px]">
                                      {row.transaction_type === 'purchase'
                                        ? 'Credits purchased'
                                        : row.transaction_type === 'venue_credit_grant'
                                        ? '🏟 Venue pass issued'
                                        : row.transaction_type === 'venue_credit_spend'
                                        ? '🏟 Venue pass used'
                                        : row.transaction_type === 'manual_add'
                                        ? 'Credits added'
                                        : row.transaction_type === 'booking'
                                        ? 'Booking'
                                        : row.transaction_type === 'booking_fee'
                                        ? 'Booking fee'
                                        : row.transaction_type === 'refund'
                                        ? 'Refund'
                                        : 'Credits update'}
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {formatTime(row.created_at)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {row.transaction_type === 'purchase'
                                      ? 'Stripe Checkout'
                                      : row.transaction_type === 'venue_credit_grant' || row.transaction_type === 'venue_credit_spend'
                                      ? ((row as any).venue_id ? (venueNameById[(row as any).venue_id] ?? '') : '') || (row.notes || '')
                                      : (row.notes || '')}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground">
                                  <div className="text-sm">
                                    {isPositive ? '+' : ''}
                                    {row.amount}
                                  </div>
                                  <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    Bal {row.balance}
                                  </div>
                                </td>
                              </tr>
                            )
                          }),
                        ])}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )
          })()
        )}
      </div>
</div>
  )
}
