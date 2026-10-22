'use client'

import { useState } from 'react'
import { Loader2, Tag as TagIcon, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { INVITE_STATUSES, INVITE_STATUS_LABELS, type InviteStatus, type Tag } from '@/lib/crm'

type Props = {
  selectedCount: number
  /** Total rows matching the current filter (for "select all N"). */
  filteredTotal: number
  allFilteredSelected: boolean
  onSelectAllFiltered: () => void
  onClear: () => void
  tags: Tag[]
  busy: boolean
  onAddTag: (name: string) => Promise<void>
  onRemoveTag: (tagId: string) => Promise<void>
  onSetStatus: (status: InviteStatus) => Promise<void>
  onDelete: () => Promise<void>
  onExportCsv: () => Promise<void>
  onCopyEmails: () => Promise<void>
}

const selectClass =
  'h-10 rounded-md border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Sticky bar shown while any rows are checked. */
export function BulkActionsBar(p: Props) {
  const [addTagOpen, setAddTagOpen] = useState(false)
  const [tagName, setTagName] = useState('')
  const count = p.allFilteredSelected ? p.filteredTotal : p.selectedCount

  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="sticky bottom-[calc(var(--app-safe-bottom)+4.25rem)] z-40 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:bottom-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">
          {count} selected
          {!p.allFilteredSelected && p.filteredTotal > p.selectedCount && (
            <>
              {' · '}
              <button type="button" className="text-primary underline underline-offset-2" onClick={p.onSelectAllFiltered}>
                select all {p.filteredTotal}
              </button>
            </>
          )}
        </span>
        <Button type="button" variant="ghost" size="sm" className="ml-auto h-9" onClick={p.onClear} aria-label="Clear selection">
          <X className="h-4 w-4" /> Clear
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {addTagOpen ? (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!tagName.trim()) return
              await p.onAddTag(tagName.trim())
              setTagName('')
              setAddTagOpen(false)
            }}
          >
            <Input
              autoFocus
              list="crm-bulk-tag-list"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Tag name"
              maxLength={40}
              className="h-10 w-44"
              aria-label="Tag to add"
            />
            <datalist id="crm-bulk-tag-list">
              {p.tags.map((t) => (
                <option key={t.id} value={t.name} />
              ))}
            </datalist>
            <Button type="submit" size="sm" className="h-10" disabled={p.busy || !tagName.trim()}>
              Add
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-10" onClick={() => setAddTagOpen(false)}>
              Cancel
            </Button>
          </form>
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => setAddTagOpen(true)} disabled={p.busy}>
            <TagIcon className="h-4 w-4" /> Add tag
          </Button>
        )}

        {p.tags.length > 0 && (
          <select
            aria-label="Remove tag from selected"
            className={selectClass}
            value=""
            disabled={p.busy}
            onChange={(e) => {
              if (e.target.value) void p.onRemoveTag(e.target.value)
            }}
          >
            <option value="">Remove tag…</option>
            {p.tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        <select
          aria-label="Set invite status for selected"
          className={selectClass}
          value=""
          disabled={p.busy}
          onChange={(e) => {
            if (e.target.value) void p.onSetStatus(e.target.value as InviteStatus)
          }}
        >
          <option value="">Set status…</option>
          {INVITE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {INVITE_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => void p.onExportCsv()} disabled={p.busy}>
          Export CSV
        </Button>
        <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => void p.onCopyEmails()} disabled={p.busy}>
          Copy emails
        </Button>

        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-10 text-destructive hover:text-destructive"
          onClick={() => void p.onDelete()}
          disabled={p.busy}
        >
          {p.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Delete
        </Button>
      </div>
    </div>
  )
}
