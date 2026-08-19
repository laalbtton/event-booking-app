'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ChevronLeft, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import FollowButton from '@/components/FollowButton'
import type { ProfileSearchResult } from '@/lib/server/follows'

const DEBOUNCE_MS = 300
/** Mirrors PROFILE_SEARCH_MIN_LENGTH in lib/server/follows.ts, which enforces it. */
const MIN_QUERY_LENGTH = 2

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

function roleLabel(role: string | null): string | null {
  if (role === 'performer') return 'Performer'
  if (role === 'event_creator') return 'Event creator'
  return null
}

export default function FeedSearchPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProfileSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) router.push('/login')
  }, [authResolved, user, router])

  useEffect(() => {
    const term = query.trim()
    if (term.length < MIN_QUERY_LENGTH) {
      setResults([])
      setSearched(false)
      setSearching(false)
      return
    }

    let cancelled = false
    setSearching(true)

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const { data } = await supabase.auth.getSession()
          const token = data.session?.access_token
          if (!token) throw new Error('Not authenticated')

          const res = await fetch(`/api/profiles/search?q=${encodeURIComponent(term)}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Search failed')

          if (!cancelled) {
            setResults((json.results ?? []) as ProfileSearchResult[])
            setSearched(true)
          }
        } catch (err: unknown) {
          if (!cancelled) toast.error(err instanceof Error ? err.message : 'Search failed')
        } finally {
          if (!cancelled) setSearching(false)
        }
      })()
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  if (!authResolved) {
    return (
      <div className="min-h-screen bg-background pb-24 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  const term = query.trim()

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 space-y-5">
        <div className="flex items-center gap-2">
          <Link
            href="/feed"
            className="p-1 -ml-1 rounded hover:bg-muted shrink-0"
            aria-label="Back to feed"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">Find people</h1>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or username…"
            className="pl-9"
            aria-label="Search people by name or username"
          />
        </div>

        {term.length < MIN_QUERY_LENGTH ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <UserPlus className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="font-medium">Search for someone to follow</p>
              <p className="text-sm text-muted-foreground">
                Type at least {MIN_QUERY_LENGTH} characters. Follow a performer and their upcoming
                gigs show up in your feed.
              </p>
            </CardContent>
          </Card>
        ) : searching && results.length === 0 ? (
          <p className="text-sm text-muted-foreground px-1">Searching…</p>
        ) : results.length === 0 && searched ? (
          <Card>
            <CardContent className="p-6 text-center space-y-2">
              <p className="font-medium">No one found</p>
              <p className="text-sm text-muted-foreground">
                Nobody matches &ldquo;{term}&rdquo;. Try a different spelling, or their username.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {results.map((person) => {
                const profileHref = `/profile/${person.username || person.id}`
                const label = roleLabel(person.role)
                return (
                  <div key={person.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={profileHref} className="shrink-0">
                      <Avatar>
                        {person.avatarUrl && (
                          <AvatarImage src={person.avatarUrl} alt={person.fullName || 'Profile'} />
                        )}
                        <AvatarFallback>{initialsOf(person.fullName)}</AvatarFallback>
                      </Avatar>
                    </Link>

                    <Link href={profileHref} className="flex-1 min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="font-medium truncate hover:underline">
                          {person.fullName || `@${person.username}`}
                        </span>
                        {label && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {label}
                          </Badge>
                        )}
                      </span>
                      {person.username && person.fullName && (
                        <span className="block text-xs text-muted-foreground truncate">
                          @{person.username}
                        </span>
                      )}
                      {person.bio?.trim() && (
                        <span className="block text-xs text-muted-foreground line-clamp-1">
                          {person.bio}
                        </span>
                      )}
                    </Link>

                    <FollowButton
                      targetUserId={person.id}
                      targetName={person.fullName ?? undefined}
                      theme="app"
                      initialFollowing={person.following}
                      className="shrink-0 px-3 py-1.5 text-xs"
                    />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
