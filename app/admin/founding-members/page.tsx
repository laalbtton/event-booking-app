'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Download, RefreshCw } from 'lucide-react'

type Member = {
  id: string
  first_name: string | null
  email: string
  city: string | null
  age_range: string | null
  canada_status: string | null
  comedy_preferences: string[] | null
  ticket_price_range: string | null
  total_credits_earned: number
  signup_completed: boolean
  preferences_completed: boolean
  email_updates_opt_in: boolean
  created_at: string
}

export default function AdminFoundingMembersPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/founding-members', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load members')
      setMembers(data.members || [])
      setTotal(data.total || 0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load members')
    } finally {
      setLoading(false)
    }
  }, [getToken])

  useEffect(() => {
    void load()
  }, [load])

  async function handleExport() {
    setDownloading(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/founding-members/export', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brampton-comedy-insider-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setDownloading(false)
    }
  }

  const completed = members.filter((m) => m.preferences_completed).length
  const optedIn = members.filter((m) => m.email_updates_opt_in).length

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brampton Comedy Insider</h1>
          <p className="text-sm text-gray-500">Founding members captured by the campaign.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExport} disabled={downloading || members.length === 0}>
            <Download className="h-4 w-4" />
            {downloading ? 'Exporting…' : 'Export CSV'}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Members" value={total} />
        <StatCard label="Preferences Done" value={completed} />
        <StatCard label="Email Opt-In" value={optedIn} />
        <StatCard label="Spots Left (of 500)" value={Math.max(0, 500 - total)} />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Age</th>
              <th className="px-4 py-3">Comedy Prefs</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Signup</th>
              <th className="px-4 py-3">Opt-In</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : members.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                  No founding members yet.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="text-gray-700">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                    {m.first_name || '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{m.email}</td>
                  <td className="whitespace-nowrap px-4 py-3">{m.city || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">{m.age_range || '—'}</td>
                  <td className="max-w-xs px-4 py-3 text-xs">
                    {m.comedy_preferences?.length ? m.comedy_preferences.join(', ') : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{m.ticket_price_range || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-semibold">
                    ${m.total_credits_earned}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {m.signup_completed ? '✓' : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {m.email_updates_opt_in ? '✓' : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-gray-500">
                    {new Date(m.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
