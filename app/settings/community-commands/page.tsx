'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Terminal } from 'lucide-react'
import { toast } from 'sonner'
import { formatDateTimeEastern } from '@/lib/dateUtils'
import type {
  AssignmentPreviewRow,
  ManagedCommunity,
} from '@/lib/server/communityCommands'

type EditableRow = AssignmentPreviewRow & {
  selected: boolean
  /** User override for event when ambiguous */
  pickedEventId: string | null
  /** User override for host when ambiguous */
  pickedHostUserId: string | null
}

function statusBadgeVariant(status: AssignmentPreviewRow['status']) {
  if (status === 'ready') return 'default' as const
  if (status === 'ambiguous') return 'secondary' as const
  return 'outline' as const
}

function effectiveEventId(row: EditableRow): string | null {
  return row.pickedEventId || row.eventId || null
}

function effectiveHostUserId(row: EditableRow): string | null {
  return row.pickedHostUserId || row.proposedHostUserId || null
}

function rowIsApplyReady(row: EditableRow): boolean {
  return !!effectiveEventId(row) && !!effectiveHostUserId(row)
}

export default function CommunityCommandsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const { confirm } = useConfirmDialog()

  const [checking, setChecking] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [communities, setCommunities] = useState<ManagedCommunity[]>([])
  const [communityId, setCommunityId] = useState('')
  const [prompt, setPrompt] = useState(
    'Assign hosts for upcoming open mics:\nWed Mar 4 — Jas\nThu Mar 5 — Aditya\nWed Mar 11 — Sunny',
  )
  const [rows, setRows] = useState<EditableRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applySummary, setApplySummary] = useState<string | null>(null)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.push('/login')
      return
    }
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token
        if (!accessToken) {
          setAllowed(false)
          return
        }

        const res = await fetch('/api/community-commands/communities', {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setAllowed(false)
          if (res.status !== 403) {
            toast.error(typeof json.error === 'string' ? json.error : 'Failed to load communities')
          }
          return
        }

        const list = (json.communities ?? []) as ManagedCommunity[]
        setCommunities(list)
        setAllowed(true)
        if (list.length === 1) setCommunityId(list[0].id)
        else if (list.length > 0) setCommunityId((prev) => prev || list[0].id)
      } catch (e: unknown) {
        setAllowed(false)
        toast.error(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        setChecking(false)
      }
    })()
  }, [authResolved, user, router])

  const selectedReadyCount = useMemo(
    () => rows.filter((r) => r.selected && rowIsApplyReady(r)).length,
    [rows],
  )

  async function getAccessToken(): Promise<string> {
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) throw new Error('Not authenticated')
    return token
  }

  async function handlePreview() {
    if (!communityId) {
      toast.error('Select a community')
      return
    }
    if (!prompt.trim()) {
      toast.error('Paste host assignment instructions first')
      return
    }

    setParsing(true)
    setApplySummary(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/community-commands/parse', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          commandType: 'assign_hosts',
          communityId,
          prompt,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Parse failed')

      const previewRows = (json.rows ?? []) as AssignmentPreviewRow[]
      setRows(
        previewRows.map((r) => ({
          ...r,
          selected: r.status === 'ready',
          pickedEventId: r.eventId,
          pickedHostUserId: r.proposedHostUserId,
        })),
      )
      if (previewRows.length === 0) toast.info('No assignments extracted')
      else toast.success(`Preview ready: ${previewRows.length} row(s)`)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to preview')
    } finally {
      setParsing(false)
    }
  }

  async function handleApply() {
    const toApply = rows
      .filter((r) => r.selected && rowIsApplyReady(r))
      .map((r) => ({
        eventId: effectiveEventId(r)!,
        newHostUserId: effectiveHostUserId(r)!,
      }))

    if (toApply.length === 0) {
      toast.error('Select at least one ready row (event + host resolved)')
      return
    }

    const ok = await confirm({
      title: `Apply ${toApply.length} host assignment(s)?`,
      message:
        'This updates host_user_id on the selected events. Review the preview carefully — changes are immediate.',
      confirmText: 'Apply selected',
      variant: 'destructive',
    })
    if (!ok) return

    setApplying(true)
    setApplySummary(null)
    try {
      const accessToken = await getAccessToken()
      const res = await fetch('/api/community-commands/apply', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          commandType: 'assign_hosts',
          communityId,
          assignments: toApply,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Apply failed')

      const applied = json.applied ?? 0
      const failed = json.failed ?? 0
      setApplySummary(`Applied ${applied}, failed ${failed}`)
      if (failed === 0) toast.success(`Updated ${applied} event host(s)`)
      else toast.error(`Applied ${applied}, failed ${failed} — check results`)

      // Mark successfully applied rows as unselected
      const successIds = new Set(
        ((json.results ?? []) as { eventId: string; success: boolean }[])
          .filter((r) => r.success)
          .map((r) => r.eventId),
      )
      setRows((prev) =>
        prev.map((r) => {
          const eid = effectiveEventId(r)
          if (eid && successIds.has(eid)) return { ...r, selected: false, currentHostName: r.proposedHostName || r.currentHostName }
          return r
        }),
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to apply')
    } finally {
      setApplying(false)
    }
  }

  function updateRow(rowId: string, patch: Partial<EditableRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  if (!authResolved || checking) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background pb-20 max-w-lg mx-auto px-4 py-8">
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ChevronLeft className="w-4 h-4" />
          Back to settings
        </Link>
        <p className="text-sm">
          You need to be a community admin, co-admin, or event creator (or platform admin) to use Community
          commands.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to settings">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Terminal className="w-5 h-5" />
          Community commands
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Assign hosts (preview first)</CardTitle>
          <CardDescription>
            Paste free-form instructions. We extract date ↔ host pairs, match them to upcoming events in your
            community, then you confirm before anything is saved. More command types later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {communities.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="community">Community</Label>
              <select
                id="community"
                className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={communityId}
                onChange={(e) => {
                  setCommunityId(e.target.value)
                  setRows([])
                  setApplySummary(null)
                }}
              >
                {communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.role ? ` (${c.role})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {communities.length === 1 && (
            <p className="text-sm text-muted-foreground">
              Community: <span className="font-medium text-foreground">{communities[0].name}</span>
            </p>
          )}

          {communities.length === 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No manageable communities found. Join a community as admin, co-admin, or event creator first.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="prompt">Instructions</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              placeholder={'Wed Mar 4 — Jas\nThu Mar 5 — Aditya'}
              className="font-mono text-sm"
            />
          </div>

          <Button type="button" onClick={() => void handlePreview()} disabled={parsing || !communityId}>
            {parsing ? 'Parsing…' : 'Preview assignments'}
          </Button>
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Preview</CardTitle>
            <CardDescription>
              Ready rows can be applied as-is. Fix ambiguous rows by picking an event and/or host, then check the
              row.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-left border-b text-muted-foreground">
                    <th className="py-2 pr-2 font-medium w-10">Apply</th>
                    <th className="py-2 pr-2 font-medium">Date / event</th>
                    <th className="py-2 pr-2 font-medium">Current host</th>
                    <th className="py-2 pr-2 font-medium">Proposed host</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const ready = rowIsApplyReady(row)
                    return (
                      <tr key={row.rowId} className="border-b border-border/60 align-top">
                        <td className="py-3 pr-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={row.selected}
                            disabled={!ready}
                            onChange={(e) => updateRow(row.rowId, { selected: e.target.checked })}
                            aria-label={`Select row ${row.rowId}`}
                          />
                        </td>
                        <td className="py-3 pr-2 space-y-1">
                          <p className="font-medium text-foreground">{row.dateHint}</p>
                          {row.resolvedDate && (
                            <p className="text-xs text-muted-foreground">Parsed: {row.resolvedDate}</p>
                          )}
                          {row.eventCandidates.length > 1 ? (
                            <select
                              className="mt-1 h-9 w-full max-w-xs rounded-md border border-input bg-background px-2 text-xs"
                              value={row.pickedEventId || ''}
                              onChange={(e) => {
                                const id = e.target.value || null
                                const ev = row.eventCandidates.find((c) => c.id === id)
                                updateRow(row.rowId, {
                                  pickedEventId: id,
                                  eventId: id,
                                  eventTitle: ev?.title ?? null,
                                  eventDate: ev?.date ?? null,
                                  currentHostName: ev?.hostName ?? null,
                                  selected: !!(id && effectiveHostUserId({ ...row, pickedEventId: id })),
                                })
                              }}
                            >
                              <option value="">Pick event…</option>
                              {row.eventCandidates.map((ev) => (
                                <option key={ev.id} value={ev.id}>
                                  {ev.title}
                                  {ev.date ? ` · ${formatDateTimeEastern(ev.date)}` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {row.eventTitle ||
                                (row.eventCandidates[0]
                                  ? row.eventCandidates[0].title
                                  : 'No event matched')}
                              {(row.eventDate || row.eventCandidates[0]?.date) && (
                                <>
                                  <br />
                                  {formatDateTimeEastern(row.eventDate || row.eventCandidates[0]!.date)}
                                </>
                              )}
                            </p>
                          )}
                          {row.notes && <p className="text-xs text-amber-700 dark:text-amber-400">{row.notes}</p>}
                        </td>
                        <td className="py-3 pr-2 text-muted-foreground">
                          {row.currentHostName ||
                            (row.pickedEventId
                              ? row.eventCandidates.find((c) => c.id === row.pickedEventId)?.hostName
                              : null) ||
                            '—'}
                        </td>
                        <td className="py-3 pr-2">
                          {row.hostCandidates.length > 1 || (!row.proposedHostUserId && row.hostCandidates.length > 0) ? (
                            <select
                              className="h-9 w-full max-w-[180px] rounded-md border border-input bg-background px-2 text-xs"
                              value={row.pickedHostUserId || ''}
                              onChange={(e) => {
                                const id = e.target.value || null
                                const host = row.hostCandidates.find((c) => c.id === id)
                                updateRow(row.rowId, {
                                  pickedHostUserId: id,
                                  proposedHostUserId: id,
                                  proposedHostName: host?.fullName ?? null,
                                  selected: !!(id && effectiveEventId({ ...row, pickedHostUserId: id })),
                                })
                              }}
                            >
                              <option value="">Pick host…</option>
                              {row.hostCandidates.map((h) => (
                                <option key={h.id} value={h.id}>
                                  {h.fullName || h.email || h.id.slice(0, 8)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-foreground">
                              {row.proposedHostName || row.hostNameHint}
                              {!row.proposedHostUserId && row.hostCandidates.length === 0 && (
                                <span className="block text-xs text-muted-foreground">unmatched</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                          {ready && row.status !== 'ready' && (
                            <p className="text-[10px] text-muted-foreground mt-1">fixed</p>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => void handleApply()}
                disabled={applying || selectedReadyCount === 0}
              >
                {applying ? 'Applying…' : `Apply selected (${selectedReadyCount})`}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  setRows((prev) =>
                    prev.map((r) => ({ ...r, selected: rowIsApplyReady(r) })),
                  )
                }
              >
                Select all ready
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRows((prev) => prev.map((r) => ({ ...r, selected: false })))}
              >
                Clear selection
              </Button>
            </div>
            {applySummary && <p className="text-sm text-muted-foreground">{applySummary}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
