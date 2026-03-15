'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ChevronLeft, Users, LogOut, Plus, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

type MyCommunity = {
  id: string
  name: string
  description: string | null
  role: string
  memberCount: number
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Admin'
  if (role === 'co_admin') return 'Co-Admin'
  if (role === 'event_creator') return 'Event Creator'
  return 'Member'
}

function roleBadgeVariant(role: string): 'default' | 'secondary' | 'outline' {
  if (role === 'admin' || role === 'co_admin') return 'default'
  if (role === 'event_creator') return 'secondary'
  return 'outline'
}

export default function SettingsCommunitiesPage() {
  const { user, authResolved } = useAuthBootstrap()
  const router = useRouter()
  const [communities, setCommunities] = useState<MyCommunity[]>([])
  const [loading, setLoading] = useState(true)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [showRequestDialog, setShowRequestDialog] = useState(false)
  const [requestForm, setRequestForm] = useState({ name: '', description: '', location: '', language: '', message: '' })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) { router.replace('/login'); return }
    loadMyCommunities()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, user])

  async function loadMyCommunities() {
    setLoading(true)
    try {
      const { data: memberships } = await supabase
        .from('community_members')
        .select('community_id, role, communities(id, name, description)')
        .eq('user_id', user!.id)

      if (!memberships) { setCommunities([]); return }

      const communityIds = memberships.map((m) => m.community_id)

      // Get member counts
      const { data: allMemberCounts } = await supabase
        .from('community_members')
        .select('community_id')
        .in('community_id', communityIds)

      const countMap: Record<string, number> = {}
      for (const m of allMemberCounts || []) {
        countMap[m.community_id] = (countMap[m.community_id] || 0) + 1
      }

      const enriched: MyCommunity[] = memberships.map((m) => {
        const comm = m.communities as unknown as { id: string; name: string; description: string | null } | null
        return {
          id: m.community_id,
          name: comm?.name || 'Unknown',
          description: comm?.description || null,
          role: m.role,
          memberCount: countMap[m.community_id] || 0,
        }
      })

      setCommunities(enriched)
    } finally {
      setLoading(false)
    }
  }

  async function handleLeave(communityId: string, communityName: string) {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { toast.error('Not authenticated'); return }
    setLeaving(communityId)
    try {
      const res = await fetch(`/api/communities/${communityId}/leave`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to leave'); return }
      setCommunities((prev) => prev.filter((c) => c.id !== communityId))
      toast.success(`Left ${communityName}.`)
    } finally {
      setLeaving(null)
    }
  }

  async function handleSubmitRequest() {
    if (!requestForm.name.trim()) { toast.error('Community name is required'); return }
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) { toast.error('Not authenticated'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/communities/create-request', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to submit request'); return }
      toast.success('Request submitted! Our team will review it.')
      setShowRequestDialog(false)
      setRequestForm({ name: '', description: '', location: '', language: '', message: '' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <NavigationTabs />
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">My Communities</h1>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href="/communities">
              <Users className="w-4 h-4 mr-1.5" />
              Browse Communities
            </Link>
          </Button>
          <Button size="sm" onClick={() => setShowRequestDialog(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Request a Community
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : communities.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-center space-y-2">
              <Users className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-muted-foreground text-sm">You haven&apos;t joined any communities yet.</p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/communities">Browse Communities</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {communities.map((community) => (
              <Card key={community.id}>
                <CardContent className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{community.name}</span>
                      <Badge variant={roleBadgeVariant(community.role)} className="text-xs">
                        {roleLabel(community.role)}
                      </Badge>
                    </div>
                    {community.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{community.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {community.memberCount.toLocaleString()} members
                    </p>
                  </div>
                  <div className="flex gap-2 items-center shrink-0">
                    <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                      <Link href={`/communities/${community.id}`} aria-label="View community">
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                    </Button>
                    {community.role !== 'admin' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleLeave(community.id, community.name)}
                        disabled={leaving === community.id}
                        aria-label="Leave community"
                      >
                        <LogOut className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Request a community dialog */}
      <Dialog open={showRequestDialog} onOpenChange={setShowRequestDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request a New Community</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label htmlFor="req-name">Community Name *</Label>
              <Input
                id="req-name"
                placeholder="e.g. Vancouver Open Mic"
                value={requestForm.name}
                onChange={(e) => setRequestForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-desc">Description</Label>
              <Textarea
                id="req-desc"
                placeholder="What is this community about?"
                value={requestForm.description}
                onChange={(e) => setRequestForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="req-location">Location</Label>
                <Input
                  id="req-location"
                  placeholder="e.g. Vancouver, BC"
                  value={requestForm.location}
                  onChange={(e) => setRequestForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="req-language">Language</Label>
                <Input
                  id="req-language"
                  placeholder="e.g. English"
                  value={requestForm.language}
                  onChange={(e) => setRequestForm((f) => ({ ...f, language: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="req-msg">Why do you want to start this community?</Label>
              <Textarea
                id="req-msg"
                placeholder="Tell us more about your plans…"
                value={requestForm.message}
                onChange={(e) => setRequestForm((f) => ({ ...f, message: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRequestDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmitRequest} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
