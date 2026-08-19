'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChevronLeft, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import type { FollowedPerson } from '@/lib/server/follows'

function initialsOf(name: string | null): string {
  if (!name?.trim()) return '?'
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export default function FollowingPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [following, setFollowing] = useState<FollowedPerson[]>([])
  const [followerCount, setFollowerCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pendingId, setPendingId] = useState<string | null>(null)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.push('/login')
      return
    }
    void load()
  }, [authResolved, user, router])

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error('Not authenticated')
    return token
  }

  async function load() {
    try {
      const token = await getToken()
      const res = await fetch('/api/follows/list', { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to load')
      setFollowing((json.following ?? []) as FollowedPerson[])
      setFollowerCount(typeof json.followerCount === 'number' ? json.followerCount : 0)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function unfollow(person: FollowedPerson) {
    setPendingId(person.id)
    try {
      const token = await getToken()
      const res = await fetch('/api/follows', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: person.id }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to unfollow')

      setFollowing((prev) => prev.filter((p) => p.id !== person.id))
      toast.success(`Unfollowed ${person.fullName || 'user'}`)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to unfollow')
    } finally {
      setPendingId(null)
    }
  }

  if (!authResolved || loading) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link href="/feed" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to feed">
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold flex-1">Following</h1>
          <Button asChild variant="outline" size="icon" aria-label="Find people to follow">
            <Link href="/feed/search">
              <Search className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {followerCount === 1
              ? '1 person follows you.'
              : `${followerCount} people follow you.`}{' '}
            Only you can see this — follower counts are never shown on profiles.
          </CardContent>
        </Card>

        {following.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center space-y-3">
              <UserPlus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="font-medium">You&apos;re not following anyone yet</p>
              <p className="text-sm text-muted-foreground">
                Search for someone by name, or open a performer&apos;s profile and tap Follow to see
                their gigs in your feed.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link href="/feed/search">Find people</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard">Browse events</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {following.map((person) => (
                <div key={person.id} className="flex items-center gap-3 px-4 py-3">
                  <Link href={`/profile/${person.username || person.id}`} className="shrink-0">
                    <Avatar>
                      {person.avatarUrl && (
                        <AvatarImage src={person.avatarUrl} alt={person.fullName || 'Performer'} />
                      )}
                      <AvatarFallback>{initialsOf(person.fullName)}</AvatarFallback>
                    </Avatar>
                  </Link>
                  <Link
                    href={`/profile/${person.username || person.id}`}
                    className="flex-1 min-w-0 hover:underline"
                  >
                    <p className="font-medium truncate">{person.fullName || 'Performer'}</p>
                    {person.username && (
                      <p className="text-xs text-muted-foreground truncate">@{person.username}</p>
                    )}
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void unfollow(person)}
                    disabled={pendingId === person.id}
                  >
                    {pendingId === person.id ? 'Removing…' : 'Unfollow'}
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
