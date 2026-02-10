'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabase'
import type { CreditTransaction } from '@/lib/supabase'
import { formatDateTime } from '@/lib/dateUtils'

type CreditRow = CreditTransaction & {
  profiles?: {
    credits?: number
  }
}

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
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {transactions.map((transaction) => {
                const isPositive = transaction.amount > 0
                return (
                  <div
                    key={transaction.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-gray-900">
                        {transaction.transaction_type === 'purchase' ? 'Credits purchased' : 'Credits update'}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(transaction.created_at)}</p>
                      {transaction.notes && (
                        <p className="text-xs text-muted-foreground">{transaction.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={isPositive ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}
                      >
                        {isPositive ? '+' : ''}
                        {transaction.amount}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
      <NavigationTabs />
    </div>
  )
}
