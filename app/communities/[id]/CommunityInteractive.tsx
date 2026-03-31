'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Users, Heart, UserCheck,
  Clock, CheckCircle2, XCircle, AlertCircle, Link2, Copy, Search,
  ChevronRight, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { communityAutoApprovesNewEvents } from '@/lib/communityAutoApprove'

type CommunityMemberRow = {
  id: string
  user_id: string
  role: string
  joined_at: string
  profiles: { full_name: string | null; email: string | null } | null
}

type ECRequest = {
  id: string
  user_id: string
  message: string | null
  status: string
  created_at: string
  profiles: { full_name: string | null; email: string | null } | null
}

type CrossSubmission = {
  id: string
  event_id: string
  status: string
  is_primary: boolean
  submitted_at: string
  expires_at: string | null
  events: { title: string | null; slug: string | null; status: string | null } | null
}

type PendingEvent = {
  id: string
  title: string
  date: string
  created_by: string | null
  profiles: { full_name: string | null; email: string | null } | null
}

type PendingVenue = {
  id: string
  name: string
  address: string
  requested_at: string | null
  profiles: { full_name: string | null; email: string | null } | null
}

type Props = {
  communityId: string
  communityName: string
  initialMemberCount: number
  initialCantWaitCount: number
  isArchived: boolean
}

export function CommunityInteractive({
  communityId,
  communityName,
  initialMemberCount,
  initialCantWaitCount,
  isArchived,
}: Props) {
  const { user, authResolved } = useAuthBootstrap()
  const router = useRouter()

  const [myRole, setMyRole] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(initialMemberCount)
  const [cantWaitCount, setCantWaitCount] = useState(initialCantWaitCount)
  const [members, setMembers] = useState<CommunityMemberRow[]>([])
  const [ecRequests, setEcRequests] = useState<ECRequest[]>([])
  const [crossSubmissions, setCrossSubmissions] = useState<CrossSubmission[]>([])
  const [pendingEvents, setPendingEvents] = useState<PendingEvent[]>([])
  const [pendingVenues, setPendingVenues] = useState<PendingVenue[]>([])
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null)
  const [inviteLinkLoading, setInviteLinkLoading] = useState(false)
  const [loadingRole, setLoadingRole] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cantWaitLoading, setCantWaitLoading] = useState(false)
  /** Remount admin Tabs once after first load so default tab reflects pending queues. */
  const [adminTabsReady, setAdminTabsReady] = useState(false)

  const [adminTab, setAdminTab] = useState('members')
  const adminTabDefaultApplied = useRef(false)

  const [memberSearch, setMemberSearch] = useState('')
  const [ecSearch, setEcSearch] = useState('')
  const [submissionSearch, setSubmissionSearch] = useState('')
  const [pendingEventSearch, setPendingEventSearch] = useState('')
  const [venueSearch, setVenueSearch] = useState('')

  const [autoApproveNewEvents, setAutoApproveNewEvents] = useState(true)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const isAdminOrCoAdmin = myRole === 'admin' || myRole === 'co_admin'
  const isEventCreator = myRole === 'event_creator'
  const isMember = Boolean(myRole)

  useEffect(() => {
    if (!authResolved || !user) return
    loadUserRole()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, user, communityId])

  useEffect(() => {
    setAdminTabsReady(false)
    adminTabDefaultApplied.current = false
    setAdminTab('members')
    setMemberSearch('')
    setEcSearch('')
    setSubmissionSearch('')
    setPendingEventSearch('')
    setVenueSearch('')
    setAutoApproveNewEvents(true)
  }, [communityId])

  useEffect(() => {
    if (!loadingRole && isAdminOrCoAdmin) {
      setAdminTabsReady(true)
    }
  }, [loadingRole, isAdminOrCoAdmin])

  useEffect(() => {
    if (!adminTabsReady || adminTabDefaultApplied.current) return
    adminTabDefaultApplied.current = true
    const next =
      pendingEvents.length > 0
        ? 'pending-events'
        : crossSubmissions.length > 0
          ? 'submissions'
          : pendingVenues.length > 0
            ? 'pending-venues'
            : ecRequests.length > 0
              ? 'ec-requests'
              : 'members'
    setAdminTab(next)
  }, [
    adminTabsReady,
    pendingEvents.length,
    crossSubmissions.length,
    pendingVenues.length,
    ecRequests.length,
  ])

  async function loadUserRole() {
    setLoadingRole(true)
    try {
      const { data: myMembership } = await supabase
        .from('community_members')
        .select('role')
        .eq('community_id', communityId)
        .eq('user_id', user!.id)
        .maybeSingle()

      const role = (myMembership as { role?: string } | null)?.role || null
      setMyRole(role)

      if (['admin', 'co_admin'].includes(role || '')) {
        const { data: sessionData } = await supabase.auth.getSession()
        const accessToken = sessionData.session?.access_token

        const [memsRes, ecReqsRes, crossSubsRes, pendingVenuesRes, pendingEventsRes] = await Promise.all([
          supabase
            .from('community_members')
            .select('id, user_id, role, joined_at, profiles(full_name, email)')
            .eq('community_id', communityId)
            .order('role', { ascending: true }),
          supabase
            .from('community_event_creator_requests')
            .select('id, user_id, message, status, created_at, profiles(full_name, email)')
            .eq('community_id', communityId)
            .eq('status', 'pending'),
          supabase
            .from('event_communities')
            .select('id, event_id, status, is_primary, submitted_at, expires_at, events(title, slug, status)')
            .eq('community_id', communityId)
            .eq('status', 'pending'),
          // Pending venues for this community
          supabase
            .from('venues')
            .select('id, name, address, requested_at, profiles:requested_by(full_name, email)')
            .eq('community_id', communityId)
            .eq('status', 'pending'),
          // Pending events via service-role API route (bypasses RLS on events table)
          accessToken
            ? fetch(`/api/communities/${communityId}/pending-events`, {
                headers: { Authorization: `Bearer ${accessToken}` },
              }).then(async (r) => {
                const json = await r.json().catch(() => ({}))
                if (!r.ok) console.warn('pending-events API error:', json)
                return json
              }).catch((err) => { console.warn('pending-events fetch error:', err); return { events: [] } })
            : Promise.resolve({ events: [] }),
        ])

        setMembers((memsRes.data || []) as unknown as CommunityMemberRow[])
        setEcRequests((ecReqsRes.data || []) as unknown as ECRequest[])
        {
          type RawCross = {
            id: string
            event_id: string
            status: string
            is_primary: boolean
            submitted_at: string
            expires_at: string | null
            events: { title: string | null; slug: string | null; status: string | null } | { title: string | null; slug: string | null; status: string | null }[] | null
          }
          const raw = (crossSubsRes.data || []) as unknown as RawCross[]
          const normalized: CrossSubmission[] = raw.map((row) => {
            const ev = Array.isArray(row.events) ? row.events[0] : row.events
            return {
              id: row.id,
              event_id: row.event_id,
              status: row.status,
              is_primary: row.is_primary,
              submitted_at: row.submitted_at,
              expires_at: row.expires_at,
              events: ev
                ? { title: ev.title ?? null, slug: ev.slug ?? null, status: ev.status ?? null }
                : null,
            }
          })
          // Primary + event still pending_approval is listed under "New Events" (avoid duplicate).
          const deduped = normalized.filter((row) => {
            const evStatus = row.events?.status
            if (row.is_primary && evStatus === 'pending_approval') return false
            return true
          })
          setCrossSubmissions(deduped)
        }

        // Pending events come from the API route which uses service role
        const apiEvents = (pendingEventsRes as { events?: any[] }).events || []
        setPendingEvents(
          apiEvents.map((ev: any) => ({
            id: ev.id,
            title: ev.title || 'Untitled',
            date: ev.date,
            created_by: ev.created_by,
            profiles: ev.profiles || null,
          }))
        )

        setPendingVenues((pendingVenuesRes.data || []) as unknown as PendingVenue[])

        const { data: commSettings, error: commSetErr } = await supabase
          .from('communities')
          .select('auto_approve_new_events')
          .eq('id', communityId)
          .maybeSingle()
        if (!commSetErr && commSettings) {
          setAutoApproveNewEvents(
            communityAutoApprovesNewEvents(
              (commSettings as { auto_approve_new_events?: boolean }).auto_approve_new_events
            )
          )
        }
      }
    } finally {
      setLoadingRole(false)
    }
  }

  async function handleToggleAutoApprove(checked: boolean) {
    const token = await getToken()
    if (!token) return
    setSettingsSaving(true)
    try {
      const res = await fetch(`/api/communities/${communityId}/settings`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoApproveNewEvents: checked }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Could not save settings')
        return
      }
      setAutoApproveNewEvents(!!json.autoApproveNewEvents)
      toast.success('Community settings saved.')
    } finally {
      setSettingsSaving(false)
    }
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function handleJoin() {
    if (!user) { router.push(`/signup?returnTo=${encodeURIComponent(`/communities/${communityId}`)}`); return }
    setActionLoading('join')
    try {
      const token = await getToken()
      if (!token) { toast.error('Please sign in'); return }
      const res = await fetch(`/api/communities/${communityId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to join'); return }
      setMyRole('member')
      setMemberCount((c) => c + 1)
      toast.success('Joined successfully!')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleLeave() {
    if (!user) return
    setActionLoading('leave')
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/communities/${communityId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to leave'); return }
      setMyRole(null)
      setMemberCount((c) => Math.max(0, c - 1))
      toast.success('Left the community.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleCantWait() {
    if (!user) { router.push(`/signup?returnTo=${encodeURIComponent(`/communities/${communityId}`)}`); return }
    setCantWaitLoading(true)
    try {
      const token = await getToken()
      if (!token) return
      const res = await fetch(`/api/communities/${communityId}/cant-wait`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      if (json.alreadyTapped) {
        toast.info("You've already expressed interest!")
      } else {
        setCantWaitCount((c) => c + 1)
        toast.success("We'll let you know when events are added!")
      }
    } finally {
      setCantWaitLoading(false)
    }
  }

  async function handleReviewECRequest(requestId: string, action: 'approved' | 'rejected') {
    const token = await getToken()
    if (!token) return
    setActionLoading(requestId)
    try {
      const res = await fetch(`/api/communities/${communityId}/review-event-creator`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(action === 'approved' ? 'Request approved!' : 'Request rejected.')
      setEcRequests((prev) => prev.filter((r) => r.id !== requestId))
      if (action === 'approved') await loadUserRole()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReviewSubmission(eventCommunityId: string, action: 'approved' | 'rejected') {
    const token = await getToken()
    if (!token) return
    setActionLoading(eventCommunityId)
    try {
      const res = await fetch(`/api/communities/${communityId}/review-event-submission`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventCommunityId, action }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(action === 'approved' ? 'Event approved!' : 'Event rejected.')
      setCrossSubmissions((prev) => prev.filter((s) => s.id !== eventCommunityId))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUpdateMemberRole(userId: string, newRole: string) {
    const token = await getToken()
    if (!token) return
    setActionLoading(`role-${userId}`)
    try {
      const res = await fetch(`/api/communities/${communityId}/update-member-role`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, role: newRole }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(typeof json.error === 'string' ? json.error : 'Failed to update role')
        return
      }
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)))
      toast.success('Role updated.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReviewPendingEvent(eventId: string, action: 'approved' | 'rejected') {
    const token = await getToken()
    if (!token) return
    setActionLoading(`event-${eventId}`)
    try {
      const res = await fetch(`/api/events/${eventId}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, communityId }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(action === 'approved' ? 'Event approved and is now live!' : 'Creator notified of required changes.')
      setPendingEvents((prev) => prev.filter((e) => e.id !== eventId))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReviewPendingVenue(venueId: string, action: 'approved' | 'rejected') {
    const token = await getToken()
    if (!token) return
    setActionLoading(`venue-${venueId}`)
    try {
      const res = await fetch(`/api/venues/${venueId}/review`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(action === 'approved' ? 'Venue approved!' : 'Venue rejected.')
      setPendingVenues((prev) => prev.filter((v) => v.id !== venueId))
    } finally {
      setActionLoading(null)
    }
  }

  async function handleGenerateInviteLink() {
    const token = await getToken()
    if (!token) return
    setInviteLinkLoading(true)
    try {
      const res = await fetch('/api/community-invite-links/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, targetRole: 'event_creator', maxUses: 50, expiresInDays: 30 }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to generate link'); return }
      const url = `${window.location.origin}/join/${json.link.token}`
      setGeneratedInviteLink(url)
    } finally {
      setInviteLinkLoading(false)
    }
  }

  function roleLabel(role: string) {
    return role === 'admin' ? 'Admin' : role === 'co_admin' ? 'Co-Admin' : role === 'event_creator' ? 'Event Creator' : 'Member'
  }

  function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
    if (role === 'admin' || role === 'co_admin') return 'default'
    if (role === 'event_creator') return 'secondary'
    return 'outline'
  }

  const filterLower = (q: string) => q.trim().toLowerCase()

  const filteredMembers = useMemo(() => {
    const q = filterLower(memberSearch)
    if (!q) return members
    return members.filter((m) => {
      const name = (m.profiles?.full_name || '').toLowerCase()
      const email = (m.profiles?.email || '').toLowerCase()
      return (
        name.includes(q) ||
        email.includes(q) ||
        m.user_id.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q)
      )
    })
  }, [members, memberSearch])

  const filteredEcRequests = useMemo(() => {
    const q = filterLower(ecSearch)
    if (!q) return ecRequests
    return ecRequests.filter((r) => {
      const name = (r.profiles?.full_name || '').toLowerCase()
      const email = (r.profiles?.email || '').toLowerCase()
      const msg = (r.message || '').toLowerCase()
      return name.includes(q) || email.includes(q) || r.user_id.toLowerCase().includes(q) || msg.includes(q)
    })
  }, [ecRequests, ecSearch])

  const filteredCrossSubmissions = useMemo(() => {
    const q = filterLower(submissionSearch)
    if (!q) return crossSubmissions
    return crossSubmissions.filter((s) => {
      const title = (s.events?.title || '').toLowerCase()
      return title.includes(q) || s.event_id.toLowerCase().includes(q)
    })
  }, [crossSubmissions, submissionSearch])

  const filteredPendingEvents = useMemo(() => {
    const q = filterLower(pendingEventSearch)
    if (!q) return pendingEvents
    return pendingEvents.filter((ev) => {
      const title = ev.title.toLowerCase()
      const creator = (ev.profiles?.full_name || '').toLowerCase()
      return title.includes(q) || creator.includes(q) || ev.id.toLowerCase().includes(q)
    })
  }, [pendingEvents, pendingEventSearch])

  const filteredPendingVenues = useMemo(() => {
    const q = filterLower(venueSearch)
    if (!q) return pendingVenues
    return pendingVenues.filter((v) => {
      const name = v.name.toLowerCase()
      const addr = v.address.toLowerCase()
      const who = (v.profiles?.full_name || '').toLowerCase()
      return name.includes(q) || addr.includes(q) || who.includes(q) || v.id.toLowerCase().includes(q)
    })
  }, [pendingVenues, venueSearch])

  return (
    <div className="space-y-4">
      {/* Member count + Join/Leave + role badge */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          {memberCount.toLocaleString()} member{memberCount !== 1 ? 's' : ''}
        </span>

        {!isArchived && authResolved && (
          <>
            {!user ? (
              <Button size="sm" onClick={handleJoin}>
                Join Community
              </Button>
            ) : loadingRole ? null : !isMember ? (
              <Button size="sm" onClick={handleJoin} disabled={actionLoading === 'join'}>
                {actionLoading === 'join' ? 'Joining…' : 'Join Community'}
              </Button>
            ) : myRole !== 'admin' ? (
              <Button variant="outline" size="sm" onClick={handleLeave} disabled={actionLoading === 'leave'}>
                {actionLoading === 'leave' ? 'Leaving…' : 'Leave'}
              </Button>
            ) : null}
            {isMember && (
              <Badge variant="secondary" className="flex items-center gap-1 text-sm px-2 py-1">
                <UserCheck className="w-3 h-3" />
                {roleLabel(myRole!)}
              </Badge>
            )}
          </>
        )}
      </div>

      {/* Cant-wait button (when no events yet and user is member) */}
      {isMember && !isArchived && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCantWait}
            disabled={cantWaitLoading}
            className="gap-1"
          >
            <Heart className="w-4 h-4" />
            {cantWaitLoading ? 'Sending…' : "Can't Wait!"}
          </Button>
          {cantWaitCount > 0 && (
            <span className="text-sm text-muted-foreground">
              {cantWaitCount} {cantWaitCount === 1 ? 'person' : 'people'} excited
            </span>
          )}
        </div>
      )}

      {isAdminOrCoAdmin && !isArchived && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Event submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 min-w-0">
                <Label htmlFor="auto-approve-new-events" className="text-sm font-medium">
                  Auto-approve primary event links
                </Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  When enabled, a creator&apos;s first (primary) community link is approved when they submit an event, so it can appear on performer dashboards as soon as the event is live. When disabled, approve links under Pending links or approve the event under New Events.
                </p>
              </div>
              <Switch
                id="auto-approve-new-events"
                className="shrink-0 data-[state=checked]:bg-primary"
                checked={autoApproveNewEvents}
                disabled={settingsSaving || loadingRole}
                onCheckedChange={handleToggleAutoApprove}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin management panel */}
      {isAdminOrCoAdmin && !isArchived && (
        <Tabs value={adminTab} onValueChange={setAdminTab} className="md:mt-0">
          <div
            className="md:hidden -mx-4 overflow-hidden rounded-xl border border-border bg-card"
            role="tablist"
            aria-label="Community admin sections"
          >
            {[
              { value: 'members' as const, label: 'Members', count: members.length, alert: 0 },
              { value: 'ec-requests' as const, label: 'EC Requests', count: ecRequests.length, alert: ecRequests.length },
              { value: 'submissions' as const, label: 'Pending links', count: crossSubmissions.length, alert: crossSubmissions.length },
              { value: 'pending-events' as const, label: 'New Events', count: pendingEvents.length, alert: pendingEvents.length },
              { value: 'pending-venues' as const, label: 'Venues', count: pendingVenues.length, alert: pendingVenues.length },
              { value: 'invite' as const, label: 'Invite', count: 0, alert: 0 },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={adminTab === tab.value}
                onClick={() => setAdminTab(tab.value)}
                className={cn(
                  'flex w-full min-h-[48px] items-center justify-between gap-3 border-b border-border px-0 py-0 text-left text-[15px] font-medium transition-colors last:border-b-0',
                  'active:bg-muted/60',
                  adminTab === tab.value ? 'bg-muted/40 text-foreground' : 'text-foreground'
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2 pl-4 pr-2 py-3">
                  <span className="truncate">{tab.label}</span>
                  {tab.alert > 0 && (
                    <Badge variant="destructive" className="h-5 shrink-0 justify-center px-1.5 text-[10px] tabular-nums">
                      {tab.alert}
                    </Badge>
                  )}
                  {!tab.alert && tab.value === 'members' && tab.count > 0 && (
                    <span className="shrink-0 text-xs font-normal text-muted-foreground tabular-nums">
                      ({tab.count})
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center pr-3 pl-1 py-3 self-stretch">
                  {adminTab === tab.value ? (
                    <Check className="h-5 w-5 text-primary" aria-hidden />
                  ) : (
                    <ChevronRight className="h-5 w-5 text-muted-foreground/45" aria-hidden />
                  )}
                </span>
              </button>
            ))}
          </div>

          <TabsList className="mt-3 hidden h-auto w-full flex-wrap gap-1 p-1 md:flex">
            <TabsTrigger value="members" className="text-xs">
              Members {members.length > 0 && `(${members.length})`}
            </TabsTrigger>
            <TabsTrigger value="ec-requests" className="text-xs">
              EC Requests
              {ecRequests.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">
                  {ecRequests.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="submissions" className="text-xs">
              Pending links
              {crossSubmissions.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">
                  {crossSubmissions.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending-events" className="text-xs">
              New Events
              {pendingEvents.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">
                  {pendingEvents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="pending-venues" className="text-xs">
              Venues
              {pendingVenues.length > 0 && (
                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">
                  {pendingVenues.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="invite" className="text-xs">
              Invite
            </TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-3 space-y-2 focus-visible:outline-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members by name, email, or role…"
                className="pl-9"
                aria-label="Search members"
              />
            </div>
            {filteredMembers.map((member) => (
              <Card key={member.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">
                      {member.profiles?.full_name || member.profiles?.email || member.user_id.slice(0, 8)}
                    </p>
                    <Badge variant={roleBadgeVariant(member.role)} className="text-xs mt-0.5">
                      {roleLabel(member.role)}
                    </Badge>
                  </div>
                  {myRole === 'admin' && member.role !== 'admin' && (
                    <select
                      className="text-xs border rounded px-2 py-1 bg-background"
                      value={member.role}
                      disabled={actionLoading === `role-${member.user_id}`}
                      onChange={(e) => handleUpdateMemberRole(member.user_id, e.target.value)}
                    >
                      <option value="member">Member</option>
                      <option value="event_creator">Event Creator</option>
                      <option value="co_admin">Co-Admin</option>
                      <option value="admin">Admin</option>
                    </select>
                  )}
                </CardContent>
              </Card>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No members yet.</p>
            )}
            {members.length > 0 && filteredMembers.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No members match your search.</p>
            )}
          </TabsContent>

          <TabsContent value="ec-requests" className="mt-3 space-y-2 focus-visible:outline-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={ecSearch}
                onChange={(e) => setEcSearch(e.target.value)}
                placeholder="Search by name, email, or message…"
                className="pl-9"
                aria-label="Search event creator requests"
              />
            </div>
            {filteredEcRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">
                        {req.profiles?.full_name || req.profiles?.email || req.user_id.slice(0, 8)}
                      </p>
                      {req.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{req.message}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="flex items-center gap-1 text-xs">
                      <Clock className="w-3 h-3" />
                      Pending
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={actionLoading === req.id}
                      onClick={() => handleReviewECRequest(req.id, 'approved')}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={actionLoading === req.id}
                      onClick={() => handleReviewECRequest(req.id, 'rejected')}
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {ecRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pending requests.</p>
            )}
            {ecRequests.length > 0 && filteredEcRequests.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No requests match your search.</p>
            )}
          </TabsContent>

          <TabsContent value="submissions" className="mt-3 space-y-2 focus-visible:outline-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={submissionSearch}
                onChange={(e) => setSubmissionSearch(e.target.value)}
                placeholder="Search pending links by event title…"
                className="pl-9"
                aria-label="Search pending community links"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Approve or reject requests to list this event in this community. Primary links for brand-new events still awaiting approval appear under &quot;New Events&quot; instead.
            </p>
            {filteredCrossSubmissions.map((sub) => {
              const isExpired = sub.expires_at && new Date(sub.expires_at) < new Date()
              return (
                <Card key={sub.id}>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">
                          {sub.events?.title || sub.event_id.slice(0, 8)}
                        </p>
                        {sub.is_primary && (
                          <Badge variant="outline" className="text-[10px] mt-1">Primary community link</Badge>
                        )}
                        {sub.expires_at && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Expires {new Date(sub.expires_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      {isExpired ? (
                        <Badge variant="destructive" className="text-xs">Expired</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Pending</Badge>
                      )}
                    </div>
                    {!isExpired && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="gap-1"
                          disabled={actionLoading === sub.id}
                          onClick={() => handleReviewSubmission(sub.id, 'approved')}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          disabled={actionLoading === sub.id}
                          onClick={() => handleReviewSubmission(sub.id, 'rejected')}
                        >
                          <XCircle className="w-3 h-3" />
                          Reject
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
            {crossSubmissions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pending submissions.</p>
            )}
            {crossSubmissions.length > 0 && filteredCrossSubmissions.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No links match your search.</p>
            )}
          </TabsContent>

          <TabsContent value="pending-events" className="mt-3 space-y-2 focus-visible:outline-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={pendingEventSearch}
                onChange={(e) => setPendingEventSearch(e.target.value)}
                placeholder="Search by event title or creator…"
                className="pl-9"
                aria-label="Search pending new events"
              />
            </div>
            {filteredPendingEvents.map((ev) => (
              <Card key={ev.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{ev.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(ev.date).toLocaleDateString('en-CA', { dateStyle: 'medium' })}
                        {ev.profiles?.full_name ? ` · by ${ev.profiles.full_name}` : ''}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">Pending</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={actionLoading === `event-${ev.id}`}
                      onClick={() => handleReviewPendingEvent(ev.id, 'approved')}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={actionLoading === `event-${ev.id}`}
                      onClick={() => handleReviewPendingEvent(ev.id, 'rejected')}
                    >
                      <XCircle className="w-3 h-3" />
                      Send Back
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {pendingEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No events pending review.</p>
            )}
            {pendingEvents.length > 0 && filteredPendingEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No events match your search.</p>
            )}
          </TabsContent>

          <TabsContent value="pending-venues" className="mt-3 space-y-2 focus-visible:outline-none">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={venueSearch}
                onChange={(e) => setVenueSearch(e.target.value)}
                placeholder="Search by venue name, address, or requester…"
                className="pl-9"
                aria-label="Search pending venues"
              />
            </div>
            {filteredPendingVenues.map((venue) => (
              <Card key={venue.id}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{venue.name}</p>
                      <p className="text-xs text-muted-foreground">{venue.address}</p>
                      {venue.profiles?.full_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Requested by {venue.profiles.full_name}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs shrink-0">Pending</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      disabled={actionLoading === `venue-${venue.id}`}
                      onClick={() => handleReviewPendingVenue(venue.id, 'approved')}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={actionLoading === `venue-${venue.id}`}
                      onClick={() => handleReviewPendingVenue(venue.id, 'rejected')}
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {pendingVenues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No pending venue requests.</p>
            )}
            {pendingVenues.length > 0 && filteredPendingVenues.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No venues match your search.</p>
            )}
          </TabsContent>

          <TabsContent value="invite" className="mt-3 space-y-3 focus-visible:outline-none">
            <div className="hidden h-10 items-center rounded-md border border-dashed border-border bg-muted/15 px-3 text-sm text-muted-foreground md:flex">
              No search for this section — invite tools below.
            </div>
            <p className="text-sm text-muted-foreground">
              Generate a link to invite someone as an Event Creator. They&apos;ll auto-join this community when they sign up or log in.
            </p>
            {generatedInviteLink ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2.5 text-sm break-all">
                  <Link2 className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 text-xs">{generatedInviteLink}</span>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteLink)
                      toast.success('Link copied!')
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Copy Link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setGeneratedInviteLink(null)}>
                    Generate New
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                className="gap-1"
                disabled={inviteLinkLoading}
                onClick={handleGenerateInviteLink}
              >
                <Link2 className="w-3 h-3" />
                {inviteLinkLoading ? 'Generating…' : 'Generate Event Creator Invite Link'}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Event creator section */}
      {isEventCreator && !isArchived && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Event Creator</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You can create events in this community from the{' '}
              <Link href="/events/manage" className="underline">
                Manage Events
              </Link>{' '}
              page.
            </p>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
