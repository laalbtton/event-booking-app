'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Users, MapPin, Globe, Heart, UserCheck,
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
  const [loadingRole, setLoadingRole] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [cantWaitLoading, setCantWaitLoading] = useState(false)

  const isAdminOrCoAdmin = myRole === 'admin' || myRole === 'co_admin'
  const isEventCreator = myRole === 'event_creator'
  const isMember = Boolean(myRole)

  useEffect(() => {
    if (!authResolved || !user) return
    loadUserRole()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, user, communityId])

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
        const [memsRes, ecReqsRes, crossSubsRes] = await Promise.all([
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
            .select('id, event_id, status, submitted_at, expires_at, events(title, slug)')
            .eq('community_id', communityId)
            .eq('status', 'pending'),
        ])
        setMembers((memsRes.data || []) as unknown as CommunityMemberRow[])
        setEcRequests((ecReqsRes.data || []) as unknown as ECRequest[])
        setCrossSubmissions((crossSubsRes.data || []) as unknown as CrossSubmission[])
      }
    } finally {
      setLoadingRole(false)
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
    if (role === 'admin' || role === 'co_admin') return 'default'
    if (role === 'event_creator') return 'secondary'
    return 'outline'
  }

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
  )
}
