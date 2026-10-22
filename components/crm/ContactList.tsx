'use client'

import { Instagram, Mail, Phone, Users } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { INVITE_STATUS_LABELS, type Contact, type InviteStatus } from '@/lib/crm'
import { openExternalScheme, openInstagramProfile } from '@/lib/platform'

const STATUS_CLASS: Record<InviteStatus, string> = {
  not_invited: 'border-transparent bg-muted text-muted-foreground',
  invited: 'border-transparent bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200',
  attended: 'border-transparent bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
  declined: 'border-transparent bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200',
}

export function InviteStatusBadge({ status, className }: { status: InviteStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', STATUS_CLASS[status], className)}>
      {INVITE_STATUS_LABELS[status]}
    </Badge>
  )
}

type Props = {
  contacts: Contact[]
  loading: boolean
  total: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
  onOpen: (contact: Contact) => void
  selected: Set<string>
  onToggleSelect: (id: string) => void
  onToggleSelectPage: () => void
  hasFilters: boolean
}

export function ContactList({
  contacts,
  loading,
  total,
  hasMore,
  loadingMore,
  onLoadMore,
  onOpen,
  selected,
  onToggleSelect,
  onToggleSelectPage,
  hasFilters,
}: Props) {
  if (loading) {
    return (
      <ul className="divide-y rounded-lg border bg-card" aria-busy="true" aria-label="Loading contacts">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-5 w-5 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </li>
        ))}
      </ul>
    )
  }

  if (!contacts.length) {
    return (
      <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <p className="font-semibold text-foreground">{hasFilters ? 'No one matches those filters' : 'No contacts yet'}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasFilters
            ? 'Try clearing a filter or searching for something else.'
            : 'Met someone at a show? Add them above so you can invite them next time.'}
        </p>
      </div>
    )
  }

  const allOnPageSelected = contacts.every((c) => selected.has(c.id))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
        <label className="flex min-h-9 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary"
            checked={allOnPageSelected}
            onChange={onToggleSelectPage}
            aria-label={allOnPageSelected ? 'Deselect everyone shown' : 'Select everyone shown'}
          />
          {allOnPageSelected ? 'Deselect shown' : 'Select shown'}
        </label>
        <span>
          Showing {contacts.length} of {total}
        </span>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {contacts.map((c) => {
          const isSelected = selected.has(c.id)
          return (
            <li
              key={c.id}
              className={cn('flex items-stretch gap-2 px-2 py-1.5 sm:px-3', isSelected && 'bg-accent/40')}
            >
              <label className="flex w-9 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={isSelected}
                  onChange={() => onToggleSelect(c.id)}
                  aria-label={`Select ${c.name}`}
                />
              </label>
              <button
                type="button"
                onClick={() => onOpen(c)}
                className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-md px-1 py-1.5 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">{c.name}</span>
                  {c.city && <span className="shrink-0 text-xs text-muted-foreground">· {c.city}</span>}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                  <InviteStatusBadge status={c.invite_status} className="h-5 px-2 text-[11px]" />
                  {c.tags.slice(0, 4).map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[11px] font-medium text-secondary-foreground"
                    >
                      {t.name}
                    </span>
                  ))}
                  {c.tags.length > 4 && (
                    <span className="text-[11px] text-muted-foreground">+{c.tags.length - 4}</span>
                  )}
                </span>
              </button>
              <div className="flex shrink-0 items-center gap-0.5">
                {c.phone && (
                  <button
                    type="button"
                    aria-label={`Call ${c.name}`}
                    title={c.phone}
                    onClick={() => void openExternalScheme(`tel:${c.phone}`)}
                    className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Phone className="h-4 w-4" />
                  </button>
                )}
                {c.email && (
                  <button
                    type="button"
                    aria-label={`Email ${c.name}`}
                    title={c.email}
                    onClick={() => void openExternalScheme(`mailto:${c.email}`)}
                    className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Mail className="h-4 w-4" />
                  </button>
                )}
                {c.instagram && (
                  <button
                    type="button"
                    aria-label={`Open @${c.instagram} on Instagram`}
                    title={`@${c.instagram}`}
                    onClick={() => void openInstagramProfile(c.instagram!)}
                    className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Instagram className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {hasMore && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" className="h-11 w-full sm:w-auto" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading…' : `Load more (${total - contacts.length} left)`}
          </Button>
        </div>
      )}
    </div>
  )
}
