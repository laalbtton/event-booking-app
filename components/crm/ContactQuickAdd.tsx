'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Contact2, Loader2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  type Contact,
  type Tag,
  contactInputSchema,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
} from '@/lib/crm'
import { CrmApiError, checkDuplicate, createContact } from '@/lib/crmClient'
import { hapticLight, hapticSuccess, isNativePlatform, pickSingleContact } from '@/lib/platform'
import { TagInput } from './TagInput'

type FormState = {
  name: string
  email: string
  phone: string
  instagram: string
  city: string
  tags: string[]
  how_met: string
  notes: string
  ok_to_contact: boolean
}

const EMPTY: FormState = {
  name: '',
  email: '',
  phone: '',
  instagram: '',
  city: '',
  tags: [],
  how_met: '',
  notes: '',
  ok_to_contact: false,
}

type Props = {
  tagSuggestions: Tag[]
  /** Called with the saved contact. The form clears itself. */
  onCreated: (contact: Contact) => void
  /** Open the existing contact when the user taps the duplicate warning. */
  onOpenExisting: (contact: Contact) => void
  /** Optionally prefill (e.g. from ?quickadd=1&name=…). */
  initial?: Partial<FormState>
  /** Remember last-used city so repeat entries at one show are quicker. */
  lastCity?: string
  className?: string
}

export function ContactQuickAdd({ tagSuggestions, onCreated, onOpenExisting, initial, lastCity, className }: Props) {
  const [form, setForm] = useState<FormState>({ ...EMPTY, ...initial })
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [moreOpen, setMoreOpen] = useState(Boolean(initial?.how_met || initial?.notes))
  const [saving, setSaving] = useState<null | 'save' | 'another'>(null)
  const [duplicate, setDuplicate] = useState<Contact | null>(null)
  const [isNative, setIsNative] = useState(false)
  const [importing, setImporting] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    isNativePlatform().then(setIsNative)
  }, [])

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: val }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  // Debounced duplicate probe whenever a contact method changes.
  const runDupCheck = useCallback((email: string, phone: string, instagram: string) => {
    if (dupTimer.current) clearTimeout(dupTimer.current)
    const e = normalizeEmail(email)
    const p = normalizePhone(phone)
    const ig = normalizeInstagram(instagram)
    if (!e && !p && !ig) {
      setDuplicate(null)
      return
    }
    dupTimer.current = setTimeout(async () => {
      try {
        const existing = await checkDuplicate({ email: e, phone: p, instagram: ig })
        setDuplicate(existing)
      } catch {
        // Probe is advisory; the server will still reject a true duplicate.
      }
    }, 400)
  }, [])

  useEffect(() => {
    runDupCheck(form.email, form.phone, form.instagram)
    return () => {
      if (dupTimer.current) clearTimeout(dupTimer.current)
    }
  }, [form.email, form.phone, form.instagram, runDupCheck])

  function reset(keepCity: boolean) {
    setForm({ ...EMPTY, city: keepCity ? form.city : '' })
    setErrors({})
    setDuplicate(null)
    // Keep "More" open if they were using it; cheap continuity between adds.
  }

  async function submit(mode: 'save' | 'another') {
    if (saving) return
    const parsed = contactInputSchema.safeParse({
      ...form,
      email: form.email || null,
      phone: form.phone || null,
      instagram: form.instagram || null,
      city: form.city || null,
      how_met: form.how_met || null,
      notes: form.notes || null,
    })
    if (!parsed.success) {
      const next: Partial<Record<keyof FormState, string>> = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FormState | undefined
        if (key && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      const firstKey = Object.keys(next)[0]
      document.getElementById(`crm-quickadd-${firstKey}`)?.focus()
      return
    }

    setSaving(mode)
    try {
      const contact = await createContact(parsed.data)
      void hapticSuccess()
      toast.success(`${contact.name} added`)
      onCreated(contact)
      reset(mode === 'another')
      if (mode === 'another') {
        requestAnimationFrame(() => nameRef.current?.focus())
      } else {
        nameRef.current?.blur()
      }
    } catch (err) {
      if (err instanceof CrmApiError) {
        if (err.status === 409 && err.existing) {
          setDuplicate(err.existing)
          toast.error(err.message)
        } else if (err.field && err.field in form) {
          setErrors({ [err.field]: err.message })
        } else {
          toast.error(err.message)
        }
      } else {
        toast.error('Could not save contact')
      }
    } finally {
      setSaving(null)
    }
  }

  async function importFromPhone() {
    if (importing) return
    setImporting(true)
    void hapticLight()
    try {
      const result = await pickSingleContact()
      if (result.status === 'picked') {
        const c = result.contact
        setForm((f) => ({
          ...f,
          name: f.name || c.name,
          email: f.email || c.email || '',
          phone: f.phone || c.phone || '',
        }))
        if (!c.name && !c.email && !c.phone) toast.info('That contact had no name, email, or phone')
      } else if (result.status === 'denied') {
        toast.error('Contacts access was denied. You can enable it in Settings → Laal Button → Contacts.')
      } else if (result.status === 'unavailable') {
        toast.info('Importing from your phone works in the Laal Button app')
      } else if (result.status === 'error') {
        toast.error(`Could not read that contact: ${result.message}`)
      }
    } finally {
      setImporting(false)
    }
  }

  const onEnterSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit('another')
    }
  }

  const fieldClass = 'h-11 text-base sm:text-sm'

  return (
    <Card className={cn('shadow-sm', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserPlus className="h-5 w-5" aria-hidden /> Add someone
          </CardTitle>
          {isNative && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9"
              onClick={importFromPhone}
              disabled={importing}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Contact2 className="h-4 w-4" />}
              Import from phone
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            void submit('another')
          }}
          noValidate
        >
          <div className="space-y-1.5">
            <Label htmlFor="crm-quickadd-name">Name *</Label>
            <Input
              id="crm-quickadd-name"
              ref={nameRef}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              onKeyDown={onEnterSubmit}
              placeholder="Who did you meet?"
              autoComplete="off"
              autoCapitalize="words"
              enterKeyHint="next"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'crm-quickadd-name-err' : undefined}
              className={fieldClass}
            />
            {errors.name && (
              <p id="crm-quickadd-name-err" className="text-xs text-destructive">
                {errors.name}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="crm-quickadd-email">Email</Label>
              <Input
                id="crm-quickadd-email"
                type="email"
                inputMode="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                onKeyDown={onEnterSubmit}
                placeholder="name@example.com"
                autoComplete="off"
                autoCapitalize="none"
                enterKeyHint="next"
                aria-invalid={!!errors.email}
                className={fieldClass}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-quickadd-phone">Phone</Label>
              <Input
                id="crm-quickadd-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                onKeyDown={onEnterSubmit}
                placeholder="(416) 555-0100"
                autoComplete="off"
                enterKeyHint="next"
                aria-invalid={!!errors.phone}
                className={fieldClass}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-quickadd-instagram">Instagram</Label>
              <Input
                id="crm-quickadd-instagram"
                value={form.instagram}
                onChange={(e) => set('instagram', e.target.value)}
                onBlur={() => {
                  const n = normalizeInstagram(form.instagram)
                  if (n !== null && n !== form.instagram) set('instagram', n)
                }}
                onKeyDown={onEnterSubmit}
                placeholder="@handle or profile link"
                autoComplete="off"
                autoCapitalize="none"
                enterKeyHint="next"
                aria-invalid={!!errors.instagram}
                className={fieldClass}
              />
              {errors.instagram && <p className="text-xs text-destructive">{errors.instagram}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="crm-quickadd-city">City</Label>
              <Input
                id="crm-quickadd-city"
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                onKeyDown={onEnterSubmit}
                placeholder={lastCity || 'Toronto'}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="next"
                list="crm-quickadd-city-list"
                className={fieldClass}
              />
              {lastCity && (
                <datalist id="crm-quickadd-city-list">
                  <option value={lastCity} />
                </datalist>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="crm-quickadd-tags">Tags</Label>
            <TagInput
              id="crm-quickadd-tags"
              value={form.tags}
              onChange={(tags) => set('tags', tags)}
              suggestions={tagSuggestions}
              placeholder="e.g. Brampton, Open-mic regular"
              onSubmitRequest={() => void submit('another')}
            />
          </div>

          {duplicate && (
            <div
              role="status"
              className="rounded-md border-2 border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800 dark:border-yellow-900/60 dark:bg-yellow-950/40 dark:text-yellow-200"
            >
              Looks like <span className="font-semibold">{duplicate.name}</span> is already in your list.{' '}
              <button
                type="button"
                onClick={() => onOpenExisting(duplicate)}
                className="font-semibold underline underline-offset-2"
              >
                Open existing
              </button>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              aria-expanded={moreOpen}
              aria-controls="crm-quickadd-more"
              className="flex min-h-10 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={cn('h-4 w-4 transition-transform', moreOpen && 'rotate-180')} />
              {moreOpen ? 'Less' : 'More (how you met, notes)'}
            </button>
            {moreOpen && (
              <div id="crm-quickadd-more" className="mt-2 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="crm-quickadd-how_met">How you met</Label>
                  <Input
                    id="crm-quickadd-how_met"
                    value={form.how_met}
                    onChange={(e) => set('how_met', e.target.value)}
                    onKeyDown={onEnterSubmit}
                    placeholder="Thursday open mic at The Corner"
                    className={fieldClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="crm-quickadd-notes">Notes</Label>
                  <Textarea
                    id="crm-quickadd-notes"
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Loved the airport bit. Comes with friends."
                    rows={2}
                    className="text-base sm:text-sm"
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <Label htmlFor="crm-quickadd-ok" className="text-sm font-normal">
                    They said it&apos;s OK to contact them about shows
                  </Label>
                  <Switch
                    id="crm-quickadd-ok"
                    checked={form.ok_to_contact}
                    onCheckedChange={(v) => set('ok_to_contact', v)}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-10"
              disabled={!!saving}
              onClick={() => void submit('save')}
            >
              {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button type="submit" className="h-11 sm:h-10" disabled={!!saving}>
              {saving === 'another' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save &amp; add another
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
