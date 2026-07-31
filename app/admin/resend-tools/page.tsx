'use client'

import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Send, Users } from 'lucide-react'

/**
 * Admin-only utility page for Resend audience/broadcast actions that would
 * otherwise require a CRON_SECRET curl call. Uses the logged-in admin's own
 * Supabase session instead, since CRON_SECRET is marked "sensitive" in
 * Vercel and can't be copied from the dashboard.
 */
export default function AdminResendToolsPage() {
  const [backfillLoading, setBackfillLoading] = useState(false)
  const [backfillResult, setBackfillResult] = useState<string>('')
  const [digestLoading, setDigestLoading] = useState(false)
  const [digestResult, setDigestResult] = useState<string>('')

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [])

  async function handleBackfill() {
    setBackfillLoading(true)
    setBackfillResult('')
    let totalAdded = 0
    let totalFailed = 0
    let offset = 0
    let total: number | undefined
    const errorSamples: string[] = []
    try {
      const token = await getToken()
      // Chunked/resumable: the API processes a small batch per call (rate-limit
      // safe) and tells us where to resume. We loop until it reports done.
      while (true) {
        const res = await fetch(`/api/admin/backfill-resend-audience?offset=${offset}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)

        totalAdded += data.added ?? 0
        totalFailed += data.failed ?? 0
        if (typeof data.total === 'number') total = data.total
        if (Array.isArray(data.sampleErrors)) errorSamples.push(...data.sampleErrors)

        setBackfillResult(
          `⏳ Processed ${offset + (data.processed ?? 0)}${total ? ` of ${total}` : ''} — ${totalAdded} added, ${totalFailed} failed so far…`,
        )

        if (data.done) break
        offset = data.nextOffset ?? offset + (data.processed ?? 0)
      }
      const errSuffix = errorSamples.length > 0 ? ` Sample errors: ${[...new Set(errorSamples)].slice(0, 3).join('; ')}` : ''
      setBackfillResult(`✅ Done. Added ${totalAdded} contacts, ${totalFailed} failed.${errSuffix}`)
    } catch (err) {
      setBackfillResult(
        `❌ ${err instanceof Error ? err.message : 'Backfill failed'} (${totalAdded} added, ${totalFailed} failed before the error)`,
      )
    } finally {
      setBackfillLoading(false)
    }
  }

  async function handleSendDigest() {
    if (!confirm('This will send the weekly digest broadcast to the full Resend segment right now. Continue?')) {
      return
    }
    setDigestLoading(true)
    setDigestResult('')
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/send-weekly-digest', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || `Request failed (${res.status})`)
      setDigestResult(
        `✅ Broadcast sent (id: ${data.broadcastId || 'n/a'}), ${data.eventCount ?? 0} event(s) included.`,
      )
    } catch (err) {
      setDigestResult(`❌ ${err instanceof Error ? err.message : 'Send failed'}`)
    } finally {
      setDigestLoading(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resend Tools</h1>
        <p className="text-sm text-gray-500">
          Manual utilities for the Resend broadcast audience — no CRON_SECRET needed, uses your admin session.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Backfill audience segment
          </CardTitle>
          <CardDescription>
            Adds every existing user with an email to the Resend contacts/segment. Safe to run multiple times.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleBackfill} disabled={backfillLoading}>
            <Users className="h-4 w-4" />
            {backfillLoading ? 'Running…' : 'Run backfill'}
          </Button>
          {backfillResult && <p className="text-sm text-gray-700">{backfillResult}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> Send weekly digest now
          </CardTitle>
          <CardDescription>
            Bypasses the Sunday cron schedule and sends the upcoming-events broadcast immediately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleSendDigest} disabled={digestLoading} variant="outline">
            <Send className="h-4 w-4" />
            {digestLoading ? 'Sending…' : 'Send digest now'}
          </Button>
          {digestResult && <p className="text-sm text-gray-700">{digestResult}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
