'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  DEFAULT_CASL_CONSENT_TEXT,
  parseAudienceText,
  prepareRows,
  type AudienceField,
  type ColumnMapping,
  type ParsedTable,
} from '@/lib/audienceImport'
import { ClipboardPaste, Eye, FileUp, Mail, Send, Upload } from 'lucide-react'

type RecentEvent = { id: string; title: string; date: string; venueName: string | null }

type Batch = {
  id: string
  event_id: string | null
  eventTitle: string | null
  eventDate: string | null
  row_count: number
  added_count: number
  existing_count: number
  invalid_count: number
  matched_profile_count: number
  welcome_sent_at: string | null
  welcome_recipient_count: number | null
  welcome_send_mode: string | null
  created_at: string
}

type ImportResult = {
  batchId: string
  addedCount: number
  existingCount: number
  invalidCount: number
  matchedProfileCount: number
  resendFailures: number
  welcomeSegmentConfigured: boolean
}

const FIELD_LABELS: Record<AudienceField, string> = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  language: 'Language',
  ignore: '— skip —',
}

const CONSENT_STORAGE_KEY = 'oms.audienceImport.consentText'

function fmtDate(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

export default function AdminAudienceImportPage() {
  const [events, setEvents] = useState<RecentEvent[]>([])
  const [batches, setBatches] = useState<Batch[]>([])
  const [welcomeSegmentConfigured, setWelcomeSegmentConfigured] = useState<boolean | null>(null)
  const [loadingMeta, setLoadingMeta] = useState(true)

  const [eventId, setEventId] = useState<string>('')
  const [consentText, setConsentText] = useState<string>(DEFAULT_CASL_CONSENT_TEXT)
  const [rawText, setRawText] = useState<string>('')
  const [mappingOverride, setMappingOverride] = useState<ColumnMapping | null>(null)

  const [importing, setImporting] = useState(false)
  const [importMessage, setImportMessage] = useState<string>('')
  const [lastResult, setLastResult] = useState<ImportResult | null>(null)

  const [sendingBatchId, setSendingBatchId] = useState<string | null>(null)
  const [sendMessage, setSendMessage] = useState<string>('')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }, [])

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true)
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/audience-import', { headers: { Authorization: `Bearer ${token}` } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setEvents(data.events || [])
      setBatches(data.batches || [])
      setWelcomeSegmentConfigured(!!data.welcomeSegmentConfigured)
      if (data.batchesError) {
        setSendMessage(`❌ ${data.batchesError}. Has sql/audience_signup_imports_migration.sql been run in Supabase?`)
      }
    } catch (err) {
      setImportMessage(`❌ ${err instanceof Error ? err.message : 'Could not load data'}`)
    } finally {
      setLoadingMeta(false)
    }
  }, [getToken])

  useEffect(() => {
    loadMeta()
    try {
      const saved = window.localStorage.getItem(CONSENT_STORAGE_KEY)
      if (saved) setConsentText(saved)
    } catch {
      /* ignore */
    }
  }, [loadMeta])

  useEffect(() => {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, consentText)
    } catch {
      /* ignore */
    }
  }, [consentText])

  // Parse on every keystroke — cheap, and gives an instant preview.
  const parsed: ParsedTable = useMemo(() => parseAudienceText(rawText), [rawText])
  const mapping: ColumnMapping = mappingOverride ?? parsed.mapping
  const prepared = useMemo(() => prepareRows(parsed.rows, mapping), [parsed.rows, mapping])

  const okCount = prepared.filter((r) => r.status === 'ok').length
  const dupCount = prepared.filter((r) => r.status === 'duplicate').length
  const invalidCount = prepared.filter((r) => r.status === 'invalid').length
  const hasEmailColumn = Object.values(mapping).includes('email')

  function setColumnField(col: number, field: AudienceField) {
    const next: ColumnMapping = { ...mapping }
    // Keep each field on one column only.
    if (field !== 'ignore') {
      for (const k of Object.keys(next)) if (next[Number(k)] === field) next[Number(k)] = 'ignore'
    }
    next[col] = field
    setMappingOverride(next)
  }

  function handleTextChange(v: string) {
    setRawText(v)
    setMappingOverride(null)
    setLastResult(null)
    setImportMessage('')
  }

  async function handleFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    handleTextChange(text)
  }

  async function handleImport() {
    if (!hasEmailColumn || okCount === 0) return
    const eventLabel = events.find((e) => e.id === eventId)?.title || 'no specific event'
    if (!confirm(`Import ${okCount} people (${eventLabel})? They will be added to the email list and Resend.`)) return

    setImporting(true)
    setImportMessage('')
    try {
      const token = await getToken()
      const res = await fetch('/api/admin/audience-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ eventId: eventId || null, consentText, rows: parsed.rows, mapping }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || `Request failed (${res.status})`)
      const r = data.result as ImportResult
      setLastResult(r)
      setImportMessage(
        `✅ Imported: ${r.addedCount} new, ${r.existingCount} already on the list (updated), ${r.matchedProfileCount} matched an app account` +
          (r.resendFailures > 0 ? `, ${r.resendFailures} failed to sync to Resend` : '') +
          '.',
      )
      setRawText('')
      setMappingOverride(null)
      await loadMeta()
    } catch (err) {
      setImportMessage(`❌ ${err instanceof Error ? err.message : 'Import failed'}`)
    } finally {
      setImporting(false)
    }
  }

  async function handlePreview(batchId: string) {
    setPreviewLoading(true)
    setPreview(null)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/audience-import/${batchId}/send-welcome`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
      setPreview({ subject: data.subject, html: data.html })
    } catch (err) {
      setSendMessage(`❌ ${err instanceof Error ? err.message : 'Preview failed'}`)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSendWelcome(batch: Batch) {
    const count = batch.added_count + batch.existing_count
    const mode = welcomeSegmentConfigured ? 'one Resend broadcast (marketing quota)' : 'individual emails (100/day transactional limit)'
    if (!confirm(`Send the post-show welcome to ${count} people from "${batch.eventTitle || 'this batch'}" as ${mode}?`)) return

    setSendingBatchId(batch.id)
    setSendMessage('')
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/audience-import/${batch.id}/send-welcome`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data?.error) throw new Error(data?.error || `Request failed (${res.status})`)
      const r = data.result as { mode: string; recipientCount: number; broadcastId: string | null; failures: string[]; skippedNotInSegment: string[] }
      let msg = `✅ Welcome sent to ${r.recipientCount} people via ${r.mode}`
      if (r.broadcastId) msg += ` (broadcast ${r.broadcastId})`
      if (r.failures.length) msg += `. Failed: ${r.failures.join(', ')}`
      if (r.skippedNotInSegment.length) msg += `. Not in Resend segment (skipped): ${r.skippedNotInSegment.join(', ')}`
      setSendMessage(msg + '.')
      await loadMeta()
    } catch (err) {
      setSendMessage(`❌ ${err instanceof Error ? err.message : 'Send failed'}`)
    } finally {
      setSendingBatchId(null)
    }
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sign-up Sheets</h1>
        <p className="text-sm text-gray-500">
          Paste the names and emails collected at a show. They join the email list (with their CASL consent and
          language preference recorded) and get a one-time &ldquo;thanks for coming&rdquo; email with the next shows.
        </p>
      </div>

      {welcomeSegmentConfigured === false && (
        <div className="bg-yellow-50 border-2 border-yellow-200 text-yellow-800 px-4 py-3 rounded text-sm">
          <strong>RESEND_WELCOME_SEGMENT_ID is not set.</strong> Welcome emails will fall back to one transactional
          email per person (shares the 100/day limit). Create a segment called &ldquo;Post-show welcome queue&rdquo; in
          Resend → Audiences and add its id to Vercel to send as a single marketing broadcast instead.
        </div>
      )}

      {/* ── Step 1: event + consent ─────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Which show was this sheet from?</CardTitle>
          <CardDescription>Used for the welcome email wording and to track repeat attendance.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">Event</label>
            <select
              value={eventId}
              onChange={(e) => setEventId(e.target.value)}
              disabled={loadingMeta}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
            >
              <option value="">— No specific event —</option>
              {events.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {fmtDate(ev.date)} · {ev.title}
                  {ev.venueName ? ` · ${ev.venueName}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-900 mb-1">
              Consent wording on the sheet (CASL)
            </label>
            <Textarea
              value={consentText}
              onChange={(e) => setConsentText(e.target.value)}
              rows={3}
              className="text-gray-900"
            />
            <p className="text-xs text-gray-500 mt-1">
              Copy the exact text printed above the signatures. It is stored with each person as proof of express
              consent. Remembered for next time.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: paste / upload ──────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardPaste className="h-4 w-4" /> 2. Paste the rows from Excel
          </CardTitle>
          <CardDescription>
            Select the cells in Excel (with or without the header row), copy, and paste here. Columns are detected
            automatically — fix them below if needed. A <code>.csv</code> file works too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={rawText}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder={'Name\tEmail\tPhone\tLanguage\nPriya Sharma\tpriya@example.com\t647 555 0100\tEnglish / Hindi'}
            rows={8}
            className="font-mono text-xs text-gray-900"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-800 cursor-pointer">
              <FileUp className="h-4 w-4" />
              Upload .csv instead
              <input
                type="file"
                accept=".csv,text/csv,text/plain,.txt,.tsv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {rawText && (
              <button
                type="button"
                className="text-sm text-gray-500 hover:text-gray-900 underline"
                onClick={() => handleTextChange('')}
              >
                Clear
              </button>
            )}
          </div>

          {parsed.rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{okCount} ready</Badge>
                {dupCount > 0 && <Badge variant="outline">{dupCount} duplicate in paste</Badge>}
                {invalidCount > 0 && <Badge variant="destructive">{invalidCount} missing / bad email</Badge>}
                <span className="text-gray-500">
                  {parsed.hasHeader ? 'Header row detected' : 'No header row'} ·{' '}
                  {parsed.delimiter === '\t' ? 'tab' : parsed.delimiter === ';' ? 'semicolon' : 'comma'} separated
                </span>
              </div>

              {!hasEmailColumn && (
                <div className="bg-red-100 border border-red-400 text-red-800 px-4 py-2 rounded text-sm">
                  Pick which column holds the email address.
                </div>
              )}

              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-gray-500 font-medium w-8">#</th>
                      {parsed.headers.map((h, col) => (
                        <th key={col} className="px-2 py-2 text-left align-top">
                          <select
                            value={mapping[col] ?? 'ignore'}
                            onChange={(e) => setColumnField(col, e.target.value as AudienceField)}
                            className="border border-gray-300 rounded px-1.5 py-1 text-xs text-gray-900 bg-white font-semibold"
                          >
                            {(Object.keys(FIELD_LABELS) as AudienceField[]).map((f) => (
                              <option key={f} value={f}>
                                {FIELD_LABELS[f]}
                              </option>
                            ))}
                          </select>
                          <div className="text-gray-400 font-normal mt-1 truncate max-w-[160px]">{h}</div>
                        </th>
                      ))}
                      <th className="px-2 py-2 text-left text-gray-500 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsed.rows.slice(0, 200).map((cells, i) => {
                      const p = prepared[i]
                      return (
                        <tr key={i} className={p.status === 'ok' ? '' : p.status === 'duplicate' ? 'bg-yellow-50' : 'bg-red-50'}>
                          <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                          {cells.map((c, col) => (
                            <td key={col} className="px-2 py-1.5 text-gray-800 whitespace-nowrap max-w-[220px] truncate">
                              {mapping[col] === 'language' && p.languages.length > 0 ? p.languages.join(', ') : c}
                            </td>
                          ))}
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            {p.status === 'ok' ? (
                              <span className="text-green-700">OK</span>
                            ) : (
                              <span className={p.status === 'duplicate' ? 'text-yellow-800' : 'text-red-700'}>{p.reason}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {parsed.rows.length > 200 && (
                  <p className="px-2 py-2 text-xs text-gray-500">Showing first 200 of {parsed.rows.length} rows.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleImport} disabled={importing || !hasEmailColumn || okCount === 0 || !consentText.trim()}>
              <Upload className="h-4 w-4" />
              {importing ? 'Importing…' : `Import ${okCount || ''} ${okCount === 1 ? 'person' : 'people'}`}
            </Button>
            {importMessage && <p className="text-sm text-gray-700">{importMessage}</p>}
          </div>
          {lastResult && lastResult.resendFailures > 0 && (
            <p className="text-xs text-yellow-800">
              Some contacts did not sync to Resend — check the server logs. They are still saved in the database and the
              Resend backfill tool can retry them later.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Step 3: batches + welcome ───────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" /> 3. Send the post-show welcome
          </CardTitle>
          <CardDescription>
            One email per batch: thanks for coming, the next Brampton shows, and the Insider $25 offer. Preview it
            first — it uses whatever shows are currently upcoming.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {sendMessage && <p className="text-sm text-gray-700">{sendMessage}</p>}
          {batches.length === 0 && !loadingMeta && (
            <p className="text-sm text-gray-500">No imports yet.</p>
          )}
          <div className="space-y-2">
            {batches.map((b) => {
              const people = b.added_count + b.existing_count
              return (
                <div
                  key={b.id}
                  className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border border-gray-200 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {b.eventTitle || 'No specific event'}
                      {b.eventDate ? <span className="text-gray-500 font-normal"> · {fmtDate(b.eventDate)}</span> : null}
                    </p>
                    <p className="text-xs text-gray-500">
                      Imported {fmtDate(b.created_at)} · {people} people ({b.added_count} new, {b.existing_count} existing
                      {b.matched_profile_count > 0 ? `, ${b.matched_profile_count} app users` : ''}
                      {b.invalid_count > 0 ? `, ${b.invalid_count} skipped` : ''})
                    </p>
                    {b.welcome_sent_at && (
                      <p className="text-xs text-green-700 mt-0.5">
                        Welcome sent {fmtDate(b.welcome_sent_at)} to {b.welcome_recipient_count ?? people} via {b.welcome_send_mode}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handlePreview(b.id)} disabled={previewLoading}>
                      <Eye className="h-4 w-4" /> Preview
                    </Button>
                    {!b.welcome_sent_at && people > 0 && (
                      <Button size="sm" onClick={() => handleSendWelcome(b)} disabled={sendingBatchId === b.id}>
                        <Send className="h-4 w-4" />
                        {sendingBatchId === b.id ? 'Sending…' : `Send welcome (${people})`}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {preview && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2 text-sm">
                <span className="text-gray-900 font-semibold truncate">Subject: {preview.subject}</span>
                <button type="button" className="text-gray-500 hover:text-gray-900 underline" onClick={() => setPreview(null)}>
                  Close
                </button>
              </div>
              <iframe title="Welcome email preview" srcDoc={preview.html} className="w-full h-[640px] bg-black" />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
