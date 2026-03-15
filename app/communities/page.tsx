'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import NavigationTabs from '@/components/NavigationTabs'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, Search, Users, MapPin, Globe, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'

type Community = {
  id: string
  name: string
  description: string | null
  location: string | null
  language: string | null
  cant_wait_count: number
  memberCount?: number
  isMember?: boolean
}

export default function CommunitiesBrowsePage() {
  const { user, authResolved } = useAuthBootstrap()
  const router = useRouter()
  const [communities, setCommunities] = useState<Community[]>([])
  const [memberCommunityIds, setMemberCommunityIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [joining, setJoining] = useState<string | null>(null)

  useEffect(() => {
    if (!authResolved) return
    loadCommunities()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authResolved, user])

  async function loadCommunities() {
    setLoading(true)
    try {
      const { data: commData } = await supabase
        .from('communities')
        .select('id, name, description, location, language, cant_wait_count')
        .eq('is_public', true)
        .eq('status', 'active')
        .order('name', { ascending: true })

      if (!commData) return

      // Get member counts
      const { data: memberCounts } = await supabase
        .from('community_members')
        .select('community_id')

      const countMap: Record<string, number> = {}
      for (const m of memberCounts || []) {
        countMap[m.community_id] = (countMap[m.community_id] || 0) + 1
      }

      const enriched = commData.map((c) => ({
        ...c,
        memberCount: countMap[c.id] || 0,
      }))

      setCommunities(enriched)

      // Get user's memberships
      if (user) {
        const { data: memberships } = await supabase
          .from('community_members')
          .select('community_id')
          .eq('user_id', user.id)

        setMemberCommunityIds(new Set((memberships || []).map((m) => m.community_id)))
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleJoin(communityId: string) {
    if (!user) {
      router.push('/login')
      return
    }
    setJoining(communityId)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) { toast.error('Please sign in to join communities'); return }

      const res = await fetch(`/api/communities/${communityId}/join`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json.error || 'Failed to join community'); return }

      setMemberCommunityIds((prev) => new Set([...prev, communityId]))
      toast.success('You have joined the community!')
    } catch {
      toast.error('Something went wrong')
    } finally {
      setJoining(null)
    }
  }

  const filtered = communities.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-background pb-20">
      <NavigationTabs />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Browse Communities</h1>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search communities…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {search ? 'No communities match your search.' : 'No communities available.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((community) => {
              const isMember = memberCommunityIds.has(community.id)
              return (
                <Card key={community.id} className="shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/communities/${community.id}`}
                            className="font-semibold text-base hover:underline"
                          >
                            {community.name}
                          </Link>
                          {isMember && (
                            <Badge variant="secondary" className="text-xs">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Joined
                            </Badge>
                          )}
                        </div>
                        {community.description && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {community.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {community.memberCount?.toLocaleString()} members
                          </span>
                          {community.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {community.location}
                            </span>
                          )}
                          {community.language && (
                            <span className="flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {community.language}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {isMember ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link href={`/communities/${community.id}`}>View</Link>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleJoin(community.id)}
                            disabled={joining === community.id}
                          >
                            {joining === community.id ? 'Joining…' : 'Join'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
