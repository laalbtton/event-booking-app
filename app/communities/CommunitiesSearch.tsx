'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import type { PublicCommunity } from '@/lib/server/publicCommunities'

type Props = {
  communities: PublicCommunity[]
}

export function CommunitiesSearch({ communities }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim()
    ? communities.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          (c.description || '').toLowerCase().includes(query.toLowerCase())
      )
    : communities

  return (
    <div className="space-y-4">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
        </svg>
        <Input
          placeholder="Search communities..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((community) => {
            const href = `/communities/${community.slug || community.id}`
            return (
              <Link
                key={community.id}
                href={href}
                className="block rounded-xl border bg-card p-4 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <h2 className="font-semibold text-base group-hover:text-primary transition-colors truncate">
                      {community.name}
                    </h2>
                    {community.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {community.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{community.memberCount.toLocaleString()} member{community.memberCount !== 1 ? 's' : ''}</span>
                      {community.upcomingEventCount > 0 && (
                        <span>{community.upcomingEventCount} upcoming event{community.upcomingEventCount !== 1 ? 's' : ''}</span>
                      )}
                      {community.location && <span>{community.location}</span>}
                      {community.language && <span>{community.language}</span>}
                    </div>
                  </div>
                  <svg
                    className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            )
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-muted/30 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {query ? `No communities found for "${query}".` : 'No communities available yet.'}
          </p>
        </div>
      )}
    </div>
  )
}
