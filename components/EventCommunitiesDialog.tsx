'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

type EventCommunityLink = {
  id: string
  community_id: string
  is_primary: boolean
  status: string
  expires_at: string | null
  community_name: string
}

type EligibleMembership = {
  community_id: string
  role: string
  community_name: string
}

type PublicCommunityRow = {
  id: string
  name: string
  slug: string | null
}

const MAX_COMMUNITIES = 3

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'approved') return 'default'
  if (status === 'pending') return 'secondary'
  if (status === 'rejected') return 'destructive'
  return 'outline'
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  if (role === 'co_admin') return 'Co-Admin'
  if (role === 'event_creator') return 'Event Creator'
  return role
}

export function EventCommunitiesDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [links, setLinks] = useState<EventCommunityLink[]>([])
  const [eligible, setEligible] = useState<EligibleMembership[]>([])
  const [search, setSearch] = useState('')
  const [publicResults, setPublicResults] = useState<PublicCommunityRow[]>([])
  const [loading, setLoading] = useState(false)
  const [publicLoading, setPublicLoading] = useState(false)
  const [submittingId, setSubmittingId] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const userId = session?.user?.id
      if (!userId) return

      const [{ data: ecRows, error: ecError }, { data: memRows, error: memError }] = await Promise.all([
        supabase
          .from('event_communities')
          .select('id, is_primary, status, expires_at, community_id')
          .eq('event_id', eventId)
          .order('submitted_at', { ascending: true }),
        supabase
          .from('community_members')
          .select('community_id, role')
          .eq('user_id', userId)
          .in('role', ['event_creator', 'co_admin', 'admin']),
      ])

      if (ecError) throw ecError
      if (memError) throw memError

      const linkCommunityIds = [...new Set((ecRows || []).map((r) => r.community_id))]
      const memCommunityIds = [...new Set((memRows || []).map((r) => r.community_id))]
      const allIds = [...new Set([...linkCommunityIds, ...memCommunityIds])]

      let nameMap: Record<string, string> = {}
      if (allIds.length > 0) {
        const { data: comms, error: cErr } = await supabase.from('communities').select('id, name').in('id', allIds)
        if (cErr) throw cErr
        for (const c of comms || []) {
          nameMap[(c as { id: string }).id] = (c as { name: string }).name
        }
      }

      setLinks(
        (ecRows || []).map((row) => ({
          id: row.id as string,
          community_id: row.community_id as string,
          is_primary: !!row.is_primary,
          status: row.status as string,
          expires_at: (row.expires_at as string | null) ?? null,
          community_name: nameMap[row.community_id as string] || 'Community',
        }))
      )

      setEligible(
        (memRows || []).map((row) => ({
          community_id: row.community_id as string,
          role: row.role as string,
          community_name: nameMap[row.community_id as string] || 'Community',
        }))
      )
    } catch (e: unknown) {
      console.error(e)
      toast.error(e instanceof Error ? e.message : 'Failed to load communities')
    } finally {
      setLoading(false)
    }
  }, [eventId])

  useEffect(() => {
    if (open) {
      void loadData()
      setSearch('')
      setPublicResults([])
    }
  }, [open, loadData])

  useEffect(() => {
    const q = search.trim()
    if (q.length < 2) {
      setPublicResults([])
      return
    }

    const t = setTimeout(async () => {
      setPublicLoading(true)
      try {
        const { data, error } = await supabase
          .from('communities')
          .select('id, name, slug')
          .eq('is_public', true)
          .eq('status', 'active')
          .ilike('name', `%${q}%`)
          .order('name', { ascending: true })
          .limit(20)

        if (error) throw error
        setPublicResults((data || []) as PublicCommunityRow[])
      } catch (e: unknown) {
        console.error(e)
        setPublicResults([])
      } finally {
        setPublicLoading(false)
      }
    }, 300)

    return () => clearTimeout(t)
  }, [search])

  const activeCount = useMemo(
    () => links.filter((l) => l.status === 'pending' || l.status === 'approved').length,
    [links]
  )

  const linkedCommunityIds = useMemo(() => new Set(links.map((l) => l.community_id)), [links])

  const eligibleToAdd = useMemo(() => {
    const q = search.trim().toLowerCase()
    return eligible.filter((m) => {
      if (linkedCommunityIds.has(m.community_id)) return false
      if (!q) return true
      return m.community_name.toLowerCase().includes(q)
    })
  }, [eligible, linkedCommunityIds, search])

  const hasPrimaryActive = useMemo(
    () =>
      links.some(
        (l) => l.is_primary && (l.status === 'pending' || l.status === 'approved')
      ),
    [links]
  )

  async function submitToCommunity(communityId: string, communityName: string) {
    if (activeCount >= MAX_COMMUNITIES) {
      toast.error(`An event can belong to at most ${MAX_COMMUNITIES} communities.`)
      return
    }

    setSubmittingId(communityId)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Not authenticated')

      const isPrimary = !hasPrimaryActive

      const res = await fetch(`/api/communities/${communityId}/submit-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ eventId, isPrimary }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Submission failed')

      toast.success(`Submitted to ${communityName}. Community admins will review when required.`)
      await loadData()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not submit to community')
    } finally {
      setSubmittingId(null)
    }
  }

  const publicRowsFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (q.length < 2) return []
    return publicResults.filter((row) => {
      if (linkedCommunityIds.has(row.id)) return false
      if (eligible.some((e) => e.community_id === row.id)) return false
      return true
    })
  }, [publicResults, linkedCommunityIds, eligible, search])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Event communities</DialogTitle>
          <DialogDescription>
            Up to {MAX_COMMUNITIES} communities per event. Submitting adds a pending link until a community admin
            approves it (when approval is required).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-1">
          <div>
            <p className="text-sm font-medium mb-2">
              Current ({activeCount}/{MAX_COMMUNITIES} active slots used)
            </p>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-muted-foreground">This event is not linked to any communities yet.</p>
            ) : (
              <ul className="space-y-2">
                {links.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium truncate block">{l.community_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {l.is_primary ? 'Primary · ' : ''}
                        {l.expires_at ? `Expires ${new Date(l.expires_at).toLocaleDateString()}` : ''}
                      </span>
                    </div>
                    <Badge variant={statusBadgeVariant(l.status)}>{l.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <label className="text-sm font-medium" htmlFor="community-search">
              Search
            </label>
            <Input
              id="community-search"
              className="mt-1"
              placeholder="Filter your communities or search public communities…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can submit only to communities where you are an event creator, co-admin, or admin.
            </p>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Submit from your memberships</p>
            {eligibleToAdd.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {search.trim()
                  ? 'No matching communities you can submit to.'
                  : 'No additional communities available — you may already be linked, or you need a creator-level role in a community.'}
              </p>
            ) : (
              <ul className="space-y-2">
                {eligibleToAdd.map((m) => (
                  <li
                    key={m.community_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm"
                  >
                    <div>
                      <span className="font-medium">{m.community_name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{roleLabel(m.role)}</span>
                    </div>
                    <Button
                      size="sm"
                      disabled={submittingId === m.community_id || activeCount >= MAX_COMMUNITIES}
                      onClick={() => submitToCommunity(m.community_id, m.community_name)}
                    >
                      {submittingId === m.community_id ? 'Submitting…' : 'Submit'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {search.trim().length >= 2 && (
            <div>
              <p className="text-sm font-medium mb-2">Browse public communities</p>
              {publicLoading ? (
                <p className="text-sm text-muted-foreground">Searching…</p>
              ) : publicRowsFiltered.length === 0 ? (
                <p className="text-sm text-muted-foreground">No extra communities match this search.</p>
              ) : (
                <ul className="space-y-2">
                  {publicRowsFiltered.map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{row.name}</span>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/communities/${row.slug || row.id}`}>View community</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                Join a community as an event creator (or get promoted) to submit this event there.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
