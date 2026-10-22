'use client'

import { useState } from 'react'
import { Check, GitMerge, Loader2, Pencil, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import type { Tag } from '@/lib/crm'
import { deleteTag, mergeTag, renameTag } from '@/lib/crmClient'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tags: Tag[]
  /** Receives the refreshed tag list after any mutation. */
  onTagsChanged: (tags: Tag[]) => void
}

export function ManageTagsDialog({ open, onOpenChange, tags, onTagsChanged }: Props) {
  const { confirm } = useConfirmDialog()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeTarget, setMergeTarget] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  async function doRename(tag: Tag) {
    const name = editName.trim()
    if (!name || name === tag.name) {
      setEditingId(null)
      return
    }
    setBusy(tag.id)
    try {
      onTagsChanged(await renameTag(tag.id, name))
      toast.success(`Renamed to “${name}”`)
      setEditingId(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not rename')
    } finally {
      setBusy(null)
    }
  }

  async function doMerge(tag: Tag) {
    if (!mergeTarget || mergeTarget === tag.id) return
    const target = tags.find((t) => t.id === mergeTarget)
    const ok = await confirm({
      title: `Merge “${tag.name}” into “${target?.name}”?`,
      message: `${tag.count ?? 0} contact${tag.count === 1 ? '' : 's'} will get the “${target?.name}” tag and “${tag.name}” will be deleted.`,
      confirmText: 'Merge',
    })
    if (!ok) return
    setBusy(tag.id)
    try {
      const { tags: next, moved } = await mergeTag(tag.id, mergeTarget)
      onTagsChanged(next)
      toast.success(`Merged — ${moved} contact${moved === 1 ? '' : 's'} moved`)
      setMergingId(null)
      setMergeTarget('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not merge')
    } finally {
      setBusy(null)
    }
  }

  async function doDelete(tag: Tag) {
    const ok = await confirm({
      title: `Delete tag “${tag.name}”?`,
      message:
        (tag.count ?? 0) > 0
          ? `It will be removed from ${tag.count} contact${tag.count === 1 ? '' : 's'}. The contacts themselves stay.`
          : 'No contacts use this tag.',
      confirmText: 'Delete',
      variant: 'destructive',
    })
    if (!ok) return
    setBusy(tag.id)
    try {
      onTagsChanged(await deleteTag(tag.id))
      toast.success(`Deleted “${tag.name}”`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Manage tags</DialogTitle>
          <DialogDescription>Rename, merge, or delete tags. Counts show how many contacts use each one.</DialogDescription>
        </DialogHeader>
        {tags.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No tags yet. Add one when you save a contact.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tags.map((tag) => {
              const isBusy = busy === tag.id
              return (
                <li key={tag.id} className="space-y-2 px-3 py-2">
                  {editingId === tag.id ? (
                    <form
                      className="flex items-center gap-2"
                      onSubmit={(e) => {
                        e.preventDefault()
                        void doRename(tag)
                      }}
                    >
                      <Input
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={40}
                        className="h-10"
                        aria-label={`New name for ${tag.name}`}
                      />
                      <Button type="submit" size="icon" className="h-10 w-10 shrink-0" disabled={isBusy} aria-label="Save name">
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-10 w-10 shrink-0" onClick={() => setEditingId(null)} aria-label="Cancel rename">
                        <X className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{tag.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{tag.count ?? 0}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        aria-label={`Rename ${tag.name}`}
                        onClick={() => {
                          setEditingId(tag.id)
                          setEditName(tag.name)
                          setMergingId(null)
                        }}
                        disabled={isBusy}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10"
                        aria-label={`Merge ${tag.name} into another tag`}
                        onClick={() => {
                          setMergingId(mergingId === tag.id ? null : tag.id)
                          setMergeTarget('')
                          setEditingId(null)
                        }}
                        disabled={isBusy || tags.length < 2}
                      >
                        <GitMerge className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-10 w-10 text-destructive hover:text-destructive"
                        aria-label={`Delete ${tag.name}`}
                        onClick={() => void doDelete(tag)}
                        disabled={isBusy}
                      >
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                  {mergingId === tag.id && (
                    <div className="flex items-center gap-2 pl-1">
                      <span className="shrink-0 text-xs text-muted-foreground">Merge into</span>
                      <select
                        value={mergeTarget}
                        onChange={(e) => setMergeTarget(e.target.value)}
                        aria-label={`Merge ${tag.name} into`}
                        className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        <option value="">Choose a tag…</option>
                        {tags
                          .filter((t) => t.id !== tag.id)
                          .map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} ({t.count ?? 0})
                            </option>
                          ))}
                      </select>
                      <Button type="button" size="sm" className="h-10" disabled={!mergeTarget || isBusy} onClick={() => void doMerge(tag)}>
                        Merge
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
