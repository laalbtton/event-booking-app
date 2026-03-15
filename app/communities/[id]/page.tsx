'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ChevronLeft, Users, MapPin, Globe, Heart, UserCheck,
  Clock, CheckCircle2, XCircle, AlertCircle
} from 'lucide-react'
import { toast } from 'sonner'

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
  submitted_at: string
  expires_at: string | null
  events: { title: string | null; slug: string | null } | null
}

type CommunityDetail = {
  id: string
  name: string
  description: string | null
  location: string | null
  language: string | null
  cant_wait_count: number
  status: string
}

export default function CommunityDetailPage() {
  const { id: communityId } = useParams<{ id: string }>()
  const { user, authResolved } = useAuthBootstrap()
  const router = useRouter()

  const [community, setCommunity] = useState<CommunityDetail | null>(null)
  const [myRole, setMyRole] = useState<string | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  const [members, setMembers] = useState<CommunityMemberRow[]>([])
  const [ecRequests, setEcRequests] = useState<ECRequest[]>([])
  const [crossSubmissions, setCrossSubmissions] = useState<CrossSubmission[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cantWaitLoading, setCantWaitLoading] = useState(false)

  const isAdminOrCoAdmin = myRole === 'admin' || myRole === 'co_admin'
  const isEventCreator = myRole === 'event_creator'
  const isMember = Boolean(myRole)

  useEffect(() => {
    if (authResolved) loadCommunity()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, communityId, user])

  async function loadCommunity() {
    setLoading(true)
    try {
      const { data: comm } = await supabase
        .from('communities')
        .select('id, name, description, location, language, cant_wait_count, status')
        .eq('id', communityId)
        .single()

      if (!comm) { router.push('/communities'); return }
      setCommunity(comm as CommunityDetail)

      const { count } = await supabase
        .from('community_members')
        .select('*', { count: 'exact', head: true })
        .eq('community_id', communityId)
      setMemberCount(count || 0)

      if (user) {
        const { data: myMembership } = await supabase
          .from('community_members')
          .select('role')
          .eq('community_id', communityId)
          .eq('user_id', user.id)
          .single()
        setMyRole(myMembership ? (myMembership as { role: string }).role : null)

        if (['admin', 'co_admin'].includes((myMembership as { role?: string } | null)?.role || '')) {
          // Load members
          const { data: mems } = await supabase
            .from('community_members')
            .select('id, user_id, role, joined_at, profiles(full_name, email)')
            .eq('community_id', communityId)
            .order('role', { ascending: true })
          setMembers((mems || []) as unknown as CommunityMemberRow[])

          // Load pending EC requests
          const { data: ecReqs } = await supabase
            .from('community_event_creator_requests')
            .select('id, user_id, message, status, created_at, profiles(full_name, email)')
            .eq('community_id', communityId)
            .eq('status', 'pending')
          setEcRequests((ecReqs || []) as unknown as ECRequest[])

          // Load pending cross-community submissions
          const { data: crossSubs } = await supabase
            .from('event_communities')
            .select('id, event_id, status, submitted_at, expires_at, events(title, slug)')
            .eq('community_id', communityId)
            .eq('status', 'pending')
          setCrossSubmissions((crossSubs || []) as unknown as CrossSubmission[])
        }
      }
    } finally {
      setLoading(false)
    }
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function handleJoin() {
    if (!user) { router.push('/login'); return }
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
    if (!user) { router.push('/login'); return }
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
        setCommunity((prev) => prev ? { ...prev, cant_wait_count: prev.cant_wait_count + 1 } : prev)
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
      if (action === 'approved') await loadCommunity()
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
      const { error } = await supabase
        .from('community_members')
        .update({ role: newRole })
        .eq('community_id', communityId)
        .eq('user_id', userId)
      if (error) { toast.error(error.message); return }
      setMembers((prev) => prev.map((m) => m.user_id === userId ? { ...m, role: newRole } : m))
      toast.success('Role updated.')
    } finally {
      setActionLoading(null)
    }
  }

  function roleLabel(role: string) {
    return role === 'admin' ? 'Admin' : role === 'co_admin' ? 'Co-Admin' : role === 'event_creator' ? 'Event Creator' : 'Member'
  }

  function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
    if (role === 'admin') return 'default'
    if (role === 'co_admin') return 'default'
    if (role === 'event_creator') return 'secondary'
    return 'outline'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <NavigationTabs />
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="h-48 rounded-xl bg-muted animate-pulse" />
        </div>
      </div>
    )
  }

  if (!community) return null

  const isArchived = community.status === 'archived'

  return (
    <div className="min-h-screen bg-background pb-20">
      <NavigationTabs />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2">
          <Link href="/communities" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold flex-1 truncate">{community.name}</h1>
          {isArchived && <Badge variant="destructive">Archived</Badge>}
        </div>

        {/* Community info card */}
        <Card>
          <CardContent className="pt-5 space-y-3">
            {community.description && (
              <p className="text-sm text-muted-foreground">{community.description}</p>
            )}
            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {memberCount.toLocaleString()} members
              </span>
              {community.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {community.location}
                </span>
              )}
              {community.language && (
                <span className="flex items-center gap-1">
                  <Globe className="w-4 h-4" />
                  {community.language}
                </span>
              )}
            </div>
            {!isArchived && (
              <div className="flex gap-2 flex-wrap pt-1">
                {!isMember ? (
                  <Button onClick={handleJoin} disabled={actionLoading === 'join'} size="sm">
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
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty state — can't wait button */}
        {isMember && !isArchived && (
          <Card className="border-dashed">
            <CardContent className="pt-5 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No events yet in this community.</p>
              <div className="flex items-center justify-center gap-2">
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
                {community.cant_wait_count > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {community.cant_wait_count} {community.cant_wait_count === 1 ? 'person' : 'people'} excited
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Admin management panel */}
        {isAdminOrCoAdmin && !isArchived && (
          <Tabs defaultValue="members">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="members">
                Members {members.length > 0 && `(${members.length})`}
              </TabsTrigger>
              <TabsTrigger value="ec-requests">
                EC Requests
                {ecRequests.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0.5">
                    {ecRequests.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="submissions">
                Events
                {crossSubmissions.length > 0 && (
                  <Badge variant="destructive" className="ml-1.5 text-xs px-1.5 py-0.5">
                    {crossSubmissions.length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="members" className="space-y-2 mt-3">
              {members.map((member) => (
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
            </TabsContent>

            <TabsContent value="ec-requests" className="space-y-2 mt-3">
              {ecRequests.map((req) => (
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
            </TabsContent>

            <TabsContent value="submissions" className="space-y-2 mt-3">
              {crossSubmissions.map((sub) => {
                const isExpired = sub.expires_at && new Date(sub.expires_at) < new Date()
                return (
                  <Card key={sub.id}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">
                            {sub.events?.title || sub.event_id.slice(0, 8)}
                          </p>
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
    </div>
  )
}
