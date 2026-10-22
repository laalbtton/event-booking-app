'use client'

import { useEffect, useState } from 'react'
import { Instagram, Loader2, Mail, Phone, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import {
  INVITE_STATUSES,
  INVITE_STATUS_LABELS,
  contactPatchSchema,
  formatPhoneForDisplay,
  normalizeInstagram,
  type Contact,
  type InviteStatus,
  type Tag,
} from '@/lib/crm'
import { CrmApiError, deleteContact, updateContact } from '@/lib/crmClient'
import { hapticLight, openExternalScheme, openInstagramProfile } from '@/lib/platform'
import { TagInput } from './TagInput'

type Props = {
  contact: Contact | null
  open: boolean
  onOpenChange: (open: boolean) => void
  tagSuggestions: Tag[]
  onSaved: (contact: Contact) => void
  onDeleted: (id: string) => void
}

type Draft = {
  name: string
  email: string
  phone: string
  instagram: string
  city: string
  how_met: string
  notes: string
  invite_status: InviteStatus
  ok_to_contact: boolean
  tags: string[]
}

function toDraft(c: Contact): Draft {
  return {
    name: c.name,
    email: c.email ?? '',
    phone: c.phone ?? '',
    instagram: c.instagram ?? '',
    city: c.city ?? '',
    how_met: c.how_met ?? '',
    notes: c.notes ?? '',
    invite_status: c.invite_status,
    ok_to_contact: c.ok_to_contact,
    tags: c.tags.map((t) => t.name),
  }
}

/**
 * Edit / delete a contact. Renders as a bottom sheet on small screens and a
 * centred dialog on larger ones.
 */
export function ContactDrawer({ contact, open, onOpenChange, tagSuggestions, onSaved, onDeleted }: Props) {
  const { confirm } = useConfirmDialog()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (contact && open) {
      setDraft(toDraft(contact))
      setErrors({})
    }
  }, [contact, open])

  if (!contact || !draft) {
    return <Dialog open={open} onOpenChange={onOpenChange} />
  }

  const set = <K extends keyof Draft>(key: K, val: Draft[K]) => {
    setDraft((d) => (d ? { ...d, [key]: val } : d))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  async function save() {
    if (!contact || !draft || saving) return
    const parsed = contactPatchSchema.safeParse({
      ...draft,
      email: draft.email || null,
      phone: draft.phone || null,
      instagram: draft.instagram || null,
      city: draft.city || null,
      how_met: draft.how_met || null,
      notes: draft.notes || null,
    })
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof Draft | undefined
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    if (!parsed.data.email && !parsed.data.phone && !parsed.data.instagram) {
      setErrors({ email: 'Keep at least one way to reach them: email, phone, or Instagram' })
      return
    }
    setSaving(true)
    try {
      const updated = await updateContact(contact.id, parsed.data)
      void hapticLight()
      toast.success('Saved')
      onSaved(updated)
      onOpenChange(false)
    } catch (err) {
      if (err instanceof CrmApiError) {
        if (err.field && err.field in draft) setErrors({ [err.field]: err.message })
        else toast.error(err.message)
      } else toast.error('Could not save')
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!contact || deleting) return
    const ok = await confirm({
      title: `Delete ${contact.name}?`,
      message: 'This removes them from your list. There is no undo.',
      confirmText: 'Delete',
      cancelText: 'Keep',
      variant: 'destructive',
    })
    if (!ok) return
    setDeleting(true)
    try {
      await deleteContact(contact.id)
      toast.success(`${contact.name} removed`)
      onDeleted(contact.id)
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete')
    } finally {
      setDeleting(false)
    }
  }

  const fieldClass = 'h-11 text-base sm:text-sm'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-auto bottom-0 max-h-[92dvh] translate-y-0 gap-3 overflow-y-auto rounded-t-2xl p-4 pb-[max(1rem,calc(1rem+var(--app-safe-bottom)))] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-top-0 sm:top-[50%] sm:bottom-auto sm:translate-y-[-50%] sm:rounded-lg sm:p-6"
      >
        <DialogHeader className="text-left">
          <DialogTitle className="truncate pr-8">{contact.name}</DialogTitle>
          <DialogDescription>Edit details, tags, and invite status.</DialogDescription>
        </DialogHeader>

        {/* Quick contact actions */}
        <div className="flex flex-wrap gap-2">
          {contact.phone && (
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => void openExternalScheme(`tel:${contact.phone}`)}>
              <Phone className="h-4 w-4" /> {formatPhoneForDisplay(contact.phone)}
            </Button>
          )}
          {contact.email && (
            <Button type="button" variant="outline" size="sm" className="h-10 max-w-full" onClick={() => void openExternalScheme(`mailto:${contact.email}`)}>
              <Mail className="h-4 w-4" /> <span className="truncate">{contact.email}</span>
            </Button>
          )}
          {contact.instagram && (
            <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => void openInstagramProfile(contact.instagram!)}>
              <Instagram className="h-4 w-4" /> @{contact.instagram}
            </Button>
          )}
        </div>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void save()
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="crm-edit-name">Name *</Label>
            <Input id="crm-edit-name" value={draft.name} onChange={(e) => set('name', e.target.value)} className={fieldClass} aria-invalid={!!errors.name} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-edit-email">Email</Label>
              <Input id="crm-edit-email" type="email" inputMode="email" autoCapitalize="none" value={draft.email} onChange={(e) => set('email', e.target.value)} className={fieldClass} aria-invalid={!!errors.email} />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-edit-phone">Phone</Label>
              <Input id="crm-edit-phone" type="tel" inputMode="tel" value={draft.phone} onChange={(e) => set('phone', e.target.value)} className={fieldClass} aria-invalid={!!errors.phone} />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-edit-instagram">Instagram</Label>
              <Input
                id="crm-edit-instagram"
                autoCapitalize="none"
                value={draft.instagram}
                onChange={(e) => set('instagram', e.target.value)}
                onBlur={() => {
                  const n = normalizeInstagram(draft.instagram)
                  if (n !== null && n !== draft.instagram) set('instagram', n)
                }}
                className={fieldClass}
                aria-invalid={!!errors.instagram}
              />
              {errors.instagram && <p className="text-xs text-destructive">{errors.instagram}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-edit-city">City</Label>
              <Input id="crm-edit-city" autoCapitalize="words" value={draft.city} onChange={(e) => set('city', e.target.value)} className={fieldClass} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="crm-edit-tags">Tags</Label>
            <TagInput id="crm-edit-tags" value={draft.tags} onChange={(tags) => set('tags', tags)} suggestions={tagSuggestions} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-edit-status">Invite status</Label>
              <select
                id="crm-edit-status"
                value={draft.invite_status}
                onChange={(e) => set('invite_status', e.target.value as InviteStatus)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-sm"
              >
                {INVITE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {INVITE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 sm:mt-6">
              <Label htmlFor="crm-edit-ok" className="text-sm font-normal">
                OK to contact
              </Label>
              <Switch id="crm-edit-ok" checked={draft.ok_to_contact} onCheckedChange={(v) => set('ok_to_contact', v)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="crm-edit-how_met">How you met</Label>
            <Input id="crm-edit-how_met" value={draft.how_met} onChange={(e) => set('how_met', e.target.value)} className={fieldClass} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crm-edit-notes">Notes</Label>
            <Textarea id="crm-edit-notes" rows={3} value={draft.notes} onChange={(e) => set('notes', e.target.value)} className="text-base sm:text-sm" />
          </div>

          <p className="text-xs text-muted-foreground">
            Added {new Date(contact.created_at).toLocaleDateString()}
            {contact.updated_at !== contact.created_at && ` · updated ${new Date(contact.updated_at).toLocaleDateString()}`}
          </p>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" className="h-11 text-destructive hover:text-destructive sm:mr-auto sm:h-10" onClick={() => void remove()} disabled={deleting || saving}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </Button>
            <Button type="button" variant="outline" className="h-11 sm:h-10" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="h-11 sm:h-10" disabled={saving || deleting}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
