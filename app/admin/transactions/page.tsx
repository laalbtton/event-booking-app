'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

type TransactionRow = {
  id: string
  user_id: string
  amount: number
  transaction_type: string
  credit_source?: 'purchase' | 'cash' | 'in_kind' | null
  source_reason?: string | null
  notes: string | null
  created_at: string
  profile: {
    full_name: string | null
    email: string
  } | null
}

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string>('')
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'purchased' | 'in_kind'>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    const today = new Date()
    const from = new Date()
    from.setDate(today.getDate() - 30)
    const toDateString = today.toISOString().slice(0, 10)
    const fromDateString = from.toISOString().slice(0, 10)
    setDateFrom(fromDateString)
    setDateTo(toDateString)
    loadTransactions()
  }, [])

  async function loadTransactions() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('credit_transactions')
      // NOTE: Do NOT embed `profiles(...)` here.
      // `credit_transactions` has more than one FK to `profiles` (e.g. `user_id` + `created_by`),
      // which makes `profiles(...)` embeds ambiguous in PostgREST.
      .select('id, user_id, amount, transaction_type, credit_source, source_reason, notes, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading credit transactions:', error)
      setTransactions([])
      setLoadError(error.message || 'Failed to load transactions')
      setLoading(false)
      return
    }

    const raw = (data || []) as Omit<TransactionRow, 'profile'>[]
    const userIds = Array.from(new Set(raw.map((r) => r.user_id).filter(Boolean)))

    let profileMap = new Map<string, { full_name: string | null; email: string }>()
    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)

      if (profilesError) {
        console.error('Error loading profiles for transactions:', profilesError)
        setLoadError(
          profilesError.message ||
            'Failed to load user details for transactions (check RLS on profiles).'
        )
      } else if (profilesData) {
        profileMap = new Map(
          profilesData.map((p: any) => [p.id as string, { full_name: p.full_name ?? null, email: p.email }])
        )
      }
    }

    setTransactions(
      raw.map((r) => ({
        ...r,
        profile: profileMap.get(r.user_id) || null,
      }))
    )
    setLoading(false)
  }

  const filteredTransactions = useMemo(() => {
    return transactions.filter((row) => {
      const name = (row.profile?.full_name || '').toLowerCase()
      const email = (row.profile?.email || '').toLowerCase()
      const query = searchTerm.toLowerCase()
      const matchesSearch = !query || name.includes(query) || email.includes(query)
      const matchesType = typeFilter === 'all' || row.transaction_type === typeFilter
      const isPurchasedRow =
        row.credit_source === 'purchase' ||
        row.credit_source === 'cash' ||
        row.transaction_type === 'purchase'
      const isInKindRow =
        row.credit_source === 'in_kind' ||
        (row.transaction_type === 'manual_add' && row.credit_source == null) ||
        (row.transaction_type === 'welcome_invite_credit' && row.credit_source == null)
      const matchesSource =
        sourceFilter === 'all' ||
        (sourceFilter === 'purchased' && isPurchasedRow) ||
        (sourceFilter === 'in_kind' && isInKindRow)

      const createdAt = new Date(row.created_at)
      const matchesFrom = !dateFrom || createdAt >= new Date(`${dateFrom}T00:00:00`)
      const matchesTo = !dateTo || createdAt <= new Date(`${dateTo}T23:59:59`)

      return matchesSearch && matchesType && matchesSource && matchesFrom && matchesTo
    })
  }, [transactions, searchTerm, typeFilter, sourceFilter, dateFrom, dateTo])

  const totalPurchased = filteredTransactions
    .filter((row) => row.credit_source === 'purchase' || row.credit_source === 'cash' || row.transaction_type === 'purchase')
    .reduce((sum, row) => sum + (row.amount || 0), 0)

  const totalInKind = filteredTransactions
    .filter((row) =>
      row.credit_source === 'in_kind' ||
      (row.transaction_type === 'manual_add' && row.credit_source == null) ||
      (row.transaction_type === 'welcome_invite_credit' && row.credit_source == null)
    )
    .reduce((sum, row) => sum + (row.amount || 0), 0)

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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Credit Transactions</h1>
        <Link href="/admin/transactions/credits-report">
          <Button variant="outline" size="sm">Credits Report</Button>
        </Link>
      </div>
      {loadError && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-red-600">
              {loadError}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              This can be caused by RLS blocking admin reads (most common), or by ambiguous embeds when a table has multiple relationships.
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Purchased credits (filtered)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totalPurchased}</div>
            <p className="text-xs text-muted-foreground">Stripe + cash payment credits</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">In-kind credits (filtered)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{totalInKind}</div>
            <p className="text-xs text-muted-foreground">Complimentary / non-cash issuance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{filteredTransactions.length}</div>
            <p className="text-xs text-muted-foreground">Matches current filters</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <Label htmlFor="transaction-search" className="text-sm font-semibold">Search</Label>
              <Input
                id="transaction-search"
                placeholder="Search by name or email"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="transaction-type" className="text-sm font-semibold">Type</Label>
              <select
                id="transaction-type"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All</option>
                <option value="purchase">Purchase</option>
                <option value="manual_add">Manual Add</option>
                <option value="refund">Refund</option>
                <option value="booking">Booking</option>
                <option value="cancellation">Cancellation</option>
                <option value="welcome_invite_credit">Welcome Invite Credit</option>
              </select>
            </div>
            <div>
              <Label htmlFor="transaction-source" className="text-sm font-semibold">Source</Label>
              <select
                id="transaction-source"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as 'all' | 'purchased' | 'in_kind')}
                className="w-full px-3 py-2 border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="all">All</option>
                <option value="purchased">Purchased (cash/stripe)</option>
                <option value="in_kind">In-kind</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={() => {
                setSearchTerm('')
                setTypeFilter('all')
                setSourceFilter('all')
                setDateFrom('')
                setDateTo('')
              }}>
                Reset filters
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="date-from" className="text-sm font-semibold">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="date-to" className="text-sm font-semibold">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTransactions.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {row.profile?.full_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500">{row.profile?.email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary">{row.transaction_type}</Badge>
                      {row.credit_source && (
                        <div className="text-xs text-gray-500 mt-1">
                          Source: {row.credit_source}
                          {row.source_reason ? ` (${row.source_reason})` : ''}
                        </div>
                      )}
                      {row.notes && (
                        <div className="text-xs text-gray-500 mt-1 truncate max-w-[220px]">
                          {row.notes}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <span className={row.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {row.amount >= 0 ? '+' : ''}{row.amount}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">
                      No transactions match your filters.
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
