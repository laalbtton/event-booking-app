'use client'

import { useEffect, useState } from 'react'
import { Search, Settings2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  CONTACT_SORTS,
  INVITE_STATUSES,
  INVITE_STATUS_LABELS,
  type ContactFilters as Filters,
  type ContactSort,
  type InviteStatus,
  type Tag,
} from '@/lib/crm'

const SORT_LABELS: Record<ContactSort, string> = {
  newest: 'Newest',
  name: 'Name A–Z',
  city: 'City',
}

type Props = {
  filters: Filters
  onChange: (next: Filters) => void
  tags: Tag[]
  cities: string[]
  total: number
  onManageTags: () => void
}

const selectClass =
  'h-10 rounded-md border border-input bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function ContactFilters({ filters, onChange, tags, cities, total, onManageTags }: Props) {
  // Local search draft so typing doesn't re-query on every keystroke.
  const [q, setQ] = useState(filters.q ?? '')
  useEffect(() => setQ(filters.q ?? ''), [filters.q])
  useEffect(() => {
    const t = setTimeout(() => {
      if ((filters.q ?? '') !== q) onChange({ ...filters, q, page: 1 })
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const selectedTags = new Set(filters.tags ?? [])
  const hasActive =
    !!filters.q || selectedTags.size > 0 || !!filters.city || !!filters.status || (filters.sort && filters.sort !== 'newest')

  function toggleTag(id: string) {
    const next = new Set(selectedTags)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onChange({ ...filters, tags: Array.from(next), page: 1 })
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone, Instagram, notes"
          aria-label="Search contacts"
          enterKeyHint="search"
          className="h-11 pl-9 pr-9 text-base sm:text-sm"
        />
        {q && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQ('')}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {tags.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tags</p>
            <div className="flex items-center gap-2">
              {selectedTags.size > 1 && (
                <div className="inline-flex rounded-md border text-xs" role="radiogroup" aria-label="Tag match mode">
                  {(['any', 'all'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      role="radio"
                      aria-checked={(filters.tagMode ?? 'any') === mode}
                      onClick={() => onChange({ ...filters, tagMode: mode, page: 1 })}
                      className={cn(
                        'min-h-8 px-2.5 font-medium capitalize first:rounded-l-md last:rounded-r-md',
                        (filters.tagMode ?? 'any') === mode
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={onManageTags}
                className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <Settings2 className="h-3.5 w-3.5" /> Manage
              </button>
            </div>
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {tags.map((t) => {
              const on = selectedTags.has(t.id)
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(t.id)}
                  className={cn(
                    'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-muted',
                  )}
                >
                  <span className="max-w-[10rem] truncate">{t.name}</span>
                  <span className={cn('text-xs', on ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                    {t.count ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filter by city"
          value={filters.city ?? ''}
          onChange={(e) => onChange({ ...filters, city: e.target.value, page: 1 })}
          className={selectClass}
        >
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Filter by invite status"
          value={filters.status ?? ''}
          onChange={(e) => onChange({ ...filters, status: e.target.value as InviteStatus | '', page: 1 })}
          className={selectClass}
        >
          <option value="">Any status</option>
          {INVITE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVITE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort"
          value={filters.sort ?? 'newest'}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as ContactSort, page: 1 })}
          className={selectClass}
        >
          {CONTACT_SORTS.map((s) => (
            <option key={s} value={s}>
              Sort: {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
          {total} {total === 1 ? 'person' : 'people'}
        </span>
        {hasActive && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9"
            onClick={() => onChange({ sort: 'newest', page: 1 })}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
