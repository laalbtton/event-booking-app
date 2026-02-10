'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { CreditTransaction } from '@/lib/supabase'
import { formatDateTime, formatTime } from '@/lib/dateUtils'

export default function CreditsHistoryPage() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentBalance, setCurrentBalance] = useState<number | null>(null)

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

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', authData.user.id)
          .single()

        if (profileError) {
          throw profileError
        }

        setCurrentBalance(profileData?.credits ?? null)

        const { data: transactionsData, error: transactionError } = await supabase
          .from('credit_transactions')
          .select('*')
          .eq('user_id', authData.user.id)
          .order('created_at', { ascending: false })

        if (transactionError) {
          throw transactionError
        }

        setTransactions(transactionsData || [])
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Credits History</h1>
            <p className="text-sm text-muted-foreground">
              Track purchases, refunds, and bookings.
            </p>
          </div>
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 underline">
            Back to Dashboard
          </Link>
        </div>

        <Card className="border-blue-200 bg-blue-50/50 shadow-sm">
          <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-sm text-blue-800">Current balance</p>
              <p className="text-2xl font-bold text-blue-900">{currentBalance ?? '--'} credits</p>
            </div>
            <Link
              href="/buy-credits"
              className="text-sm font-semibold text-blue-700 hover:text-blue-900 underline underline-offset-4"
            >
              Buy more credits
            </Link>
          </CardContent>
        </Card>

        {loading ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">Loading credits history…</CardContent>
          </Card>
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
                                      {row.transaction_type === 'purchase' ? 'Credits purchased' : 'Credits update'}
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                      {formatTime(row.created_at)}
                                    </span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {row.transaction_type === 'purchase'
                                      ? 'Stripe Checkout'
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
      <NavigationTabs />
    </div>
  )
}
