'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { CheckCircle2, XCircle, Users, MapPin, Globe, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

type CreationRequest = {
  id: string
  user_id: string
  name: string
  description: string | null
  location: string | null
  language: string | null
  message: string | null
  status: string
  created_at: string
  profiles: { full_name: string | null; email: string | null } | null
}

type Community = {
  id: string
  name: string
  description: string | null
  location: string | null
  language: string | null
  status: string
  created_at: string
  memberCount: number
  eventCount: number
}

export default function AdminCommunitiesPage() {
  const [creationRequests, setCreationRequests] = useState<CreationRequest[]>([])
  const [communities, setCommunities] = useState<Community[]>([])
  const [archivedCommunities, setArchivedCommunities] = useState<Community[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<CreationRequest | null>(null)
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected' | null>(null)
  const [shutdownCommunity, setShutdownCommunity] = useState<Community | null>(null)
  const [shutdownReason, setShutdownReason] = useState('')

  useEffect(() => {
    void loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      // Pending creation requests
      const { data: reqs } = await supabase
        .from('community_creation_requests')
        .select('id, user_id, name, description, location, language, message, status, created_at, profiles(full_name, email)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setCreationRequests((reqs || []) as unknown as CreationRequest[])

      // All active communities
      const { data: comms } = await supabase
        .from('communities')
        .select('id, name, description, location, language, status, created_at')
        .eq('status', 'active')
        .order('name', { ascending: true })

      // All archived
      const { data: archived } = await supabase
        .from('communities')
        .select('id, name, description, location, language, status, created_at')
        .eq('status', 'archived')
        .order('name', { ascending: true })

      // Member and event counts
      const { data: memberCounts } = await supabase
        .from('community_members')
        .select('community_id')

      const { data: eventCounts } = await supabase
        .from('event_communities')
        .select('community_id')
        .eq('status', 'approved')

      const mMap: Record<string, number> = {}
      for (const m of memberCounts || []) mMap[m.community_id] = (mMap[m.community_id] || 0) + 1

      const eMap: Record<string, number> = {}
      for (const e of eventCounts || []) eMap[e.community_id] = (eMap[e.community_id] || 0) + 1

      const enrich = (list: typeof comms) =>
        (list || []).map((c) => ({
          ...c,
          memberCount: mMap[c.id] || 0,
          eventCount: eMap[c.id] || 0,
        }))

      setCommunities(enrich(comms) as Community[])
      setArchivedCommunities(enrich(archived) as Community[])
    } finally {
      setLoading(false)
    }
  }

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || null
  }

  async function handleReviewCreation() {
    if (!selectedRequest || !reviewAction) return
    const token = await getToken()
    if (!token) return
    setActionLoading(selectedRequest.id)
    try {
      const res = await fetch('/api/admin/communities/review-creation', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedRequest.id,
          action: reviewAction,
          adminNotes: reviewNotes || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(reviewAction === 'approved' ? 'Community created and approved!' : 'Request rejected.')
      setSelectedRequest(null)
      setReviewAction(null)
      setReviewNotes('')
      await loadData()
    } finally {
      setActionLoading(null)
    }
  }

  async function handleShutdown() {
    if (!shutdownCommunity) return
    const token = await getToken()
    if (!token) return
    setActionLoading(shutdownCommunity.id)
    try {
      const res = await fetch('/api/admin/communities/shutdown', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId: shutdownCommunity.id, reason: shutdownReason || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed'); return }
      toast.success(`"${shutdownCommunity.name}" has been shut down.`)
      setShutdownCommunity(null)
      setShutdownReason('')
      await loadData()
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Communities</h1>

      <Tabs defaultValue="requests">
        <TabsList>
          <TabsTrigger value="requests">
            Creation Requests
            {creationRequests.length > 0 && (
              <Badge variant="destructive" className="ml-2 text-xs px-1.5">{creationRequests.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">All Communities ({communities.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archivedCommunities.length})</TabsTrigger>
        </TabsList>

        {/* Creation Requests */}
        <TabsContent value="requests" className="mt-4 space-y-3">
          {creationRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No pending creation requests.</p>
          ) : (
            creationRequests.map((req) => (
              <Card key={req.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{req.name}</p>
                      <p className="text-sm text-muted-foreground">
                        By {req.profiles?.full_name || req.profiles?.email || req.user_id.slice(0, 8)}
                      </p>
                      {req.description && (
                        <p className="text-sm text-muted-foreground mt-1">{req.description}</p>
                      )}
                      <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                        {req.location && (
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location}</span>
                        )}
                        {req.language && (
                          <span className="flex items-center gap-1"><Globe className="w-3 h-3" />{req.language}</span>
                        )}
                      </div>
                      {req.message && (
                        <p className="text-sm mt-2 p-2 bg-muted rounded">{req.message}</p>
                      )}
                    </div>
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="gap-1"
                      onClick={() => { setSelectedRequest(req); setReviewAction('approved') }}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => { setSelectedRequest(req); setReviewAction('rejected') }}
                    >
                      <XCircle className="w-3 h-3" />
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Active Communities */}
        <TabsContent value="active" className="mt-4 space-y-3">
          {communities.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No active communities.</p>
          ) : (
            communities.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold">{c.name}</p>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                    )}
                    <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.memberCount} members</span>
                      <span>{c.eventCount} events</span>
                      {c.location && (
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location}</span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => setShutdownCommunity(c)}
                    disabled={actionLoading === c.id}
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Shut Down
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Archived Communities */}
        <TabsContent value="archived" className="mt-4 space-y-3">
          {archivedCommunities.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4">No archived communities.</p>
          ) : (
            archivedCommunities.map((c) => (
              <Card key={c.id} className="opacity-60">
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{c.name}</p>
                      <Badge variant="destructive" className="text-xs">Archived</Badge>
                    </div>
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{c.description}</p>
                    )}
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.memberCount} members</span>
                      <span>{c.eventCount} events</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Review Creation Request Dialog */}
      <Dialog open={Boolean(selectedRequest)} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {reviewAction === 'approved' ? 'Approve' : 'Reject'} Community Request
            </DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-3 py-2">
              <p className="text-sm">
                <span className="font-medium">Community:</span> {selectedRequest.name}
              </p>
              <p className="text-sm">
                <span className="font-medium">Requested by:</span>{' '}
                {selectedRequest.profiles?.full_name || selectedRequest.profiles?.email}
              </p>
              <div className="space-y-1">
                <Label htmlFor="review-notes">Admin Notes (optional)</Label>
                <Textarea
                  id="review-notes"
                  placeholder={reviewAction === 'rejected' ? 'Reason for rejection…' : 'Welcome message or notes…'}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedRequest(null); setReviewNotes('') }}>Cancel</Button>
            <Button
              variant={reviewAction === 'rejected' ? 'destructive' : 'default'}
              onClick={handleReviewCreation}
              disabled={Boolean(actionLoading)}
            >
              {actionLoading ? 'Processing…' : reviewAction === 'approved' ? 'Approve & Create' : 'Reject'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Shutdown Dialog */}
      <Dialog open={Boolean(shutdownCommunity)} onOpenChange={(open) => !open && setShutdownCommunity(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Shut Down Community</DialogTitle>
          </DialogHeader>
          {shutdownCommunity && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                You are about to shut down <span className="font-semibold text-foreground">{shutdownCommunity.name}</span>.
                This will archive the community and notify all {shutdownCommunity.memberCount} members.
                This action cannot be undone from the UI.
              </p>
              <div className="space-y-1">
                <Label htmlFor="shutdown-reason">Reason (optional, shown to members)</Label>
                <Textarea
                  id="shutdown-reason"
                  placeholder="Why is this community being shut down?"
                  value={shutdownReason}
                  onChange={(e) => setShutdownReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShutdownCommunity(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleShutdown} disabled={Boolean(actionLoading)}>
              {actionLoading ? 'Shutting down…' : 'Shut Down Community'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
