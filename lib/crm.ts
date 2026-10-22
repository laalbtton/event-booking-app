/**
 * CRM shared helpers: types, normalizers, and zod schemas.
 * Imported by both the client (forms) and API routes so validation stays
 * identical on both sides.
 */
import { z } from 'zod'

// ── Types ───────────────────────────────────────────────────

export const INVITE_STATUSES = ['not_invited', 'invited', 'attended', 'declined'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

export const INVITE_STATUS_LABELS: Record<InviteStatus, string> = {
  not_invited: 'Not invited',
  invited: 'Invited',
  attended: 'Attended',
  declined: 'Declined',
}

export const CONTACT_SORTS = ['newest', 'name', 'city'] as const
export type ContactSort = (typeof CONTACT_SORTS)[number]

export type Tag = {
  id: string
  name: string
  /** Number of contacts using this tag (only present on list endpoints). */
  count?: number
}

export type Contact = {
  id: string
  owner_id: string
  name: string
  email: string | null
  phone: string | null
  instagram: string | null
  city: string | null
  notes: string | null
  how_met: string | null
  invite_status: InviteStatus
  ok_to_contact: boolean
  created_at: string
  updated_at: string
  tags: Tag[]
}

export type ContactFilters = {
  q?: string
  tags?: string[] // tag ids
  tagMode?: 'any' | 'all'
  city?: string
  status?: InviteStatus | ''
  sort?: ContactSort
  page?: number
  pageSize?: number
}

export const DEFAULT_PAGE_SIZE = 50

// ── Normalizers (mirror sql/crm_contacts_migration.sql) ─────

export function normalizeEmail(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().toLowerCase()
  return v === '' ? null : v
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email)
}

/**
 * Loose E.164: digits only, with a leading "+". Ten-digit numbers are assumed
 * North American (+1). Returns null for empty input.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return null
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/\D/g, '')
  if (!digits) return null
  if (hasPlus) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

export function isPlausiblePhone(normalized: string): boolean {
  const digits = normalized.replace(/\D/g, '')
  return digits.length >= 7 && digits.length <= 15
}

/** Pretty display for a stored phone, e.g. +14165550100 → (416) 555-0100. */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return ''
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return phone
}

/**
 * Strips "@", instagram.com URLs, trailing slashes/query strings and lowercases.
 * "@Sunny_C" → "sunny_c"; "https://www.instagram.com/sunny_c/?hl=en" → "sunny_c".
 */
export function normalizeInstagram(raw: string | null | undefined): string | null {
  let v = (raw ?? '').trim().toLowerCase()
  if (!v) return null
  v = v.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//, '')
  v = v.replace(/^@/, '')
  v = v.replace(/[/?#].*$/, '')
  return v === '' ? null : v
}

const INSTAGRAM_RE = /^[a-z0-9._]{1,30}$/

export function isValidInstagram(handle: string): boolean {
  return INSTAGRAM_RE.test(handle)
}

export function normalizeTagName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 40)
}

export function normalizeCity(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim().replace(/\s+/g, ' ')
  return v === '' ? null : v
}

// ── Zod schemas ─────────────────────────────────────────────

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => {
      const t = (v ?? '').trim()
      return t === '' ? null : t
    })

export const contactInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: optionalText(254).transform((v) => normalizeEmail(v)),
    phone: optionalText(40).transform((v) => normalizePhone(v)),
    instagram: optionalText(120).transform((v) => normalizeInstagram(v)),
    city: optionalText(80).transform((v) => normalizeCity(v)),
    notes: optionalText(2000),
    how_met: optionalText(200),
    invite_status: z.enum(INVITE_STATUSES).default('not_invited'),
    ok_to_contact: z.boolean().default(false),
    /** Tag names; unknown names are created for the owner. */
    tags: z.array(z.string().trim().min(1).max(40)).max(25).default([]),
  })
  .superRefine((val, ctx) => {
    if (!val.email && !val.phone && !val.instagram) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'Add at least one way to reach them: email, phone, or Instagram',
      })
    }
    if (val.email && !isValidEmail(val.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'That email looks off' })
    }
    if (val.phone && !isPlausiblePhone(val.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone needs 7–15 digits' })
    }
    if (val.instagram && !isValidInstagram(val.instagram)) {
      ctx.addIssue({
        code: 'custom',
        path: ['instagram'],
        message: 'Instagram handles use letters, numbers, dots and underscores',
      })
    }
  })

export type ContactInput = z.infer<typeof contactInputSchema>

/** PATCH payload: every field optional, same normalization. */
export const contactPatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    email: optionalText(254).transform((v) => normalizeEmail(v)).optional(),
    phone: optionalText(40).transform((v) => normalizePhone(v)).optional(),
    instagram: optionalText(120).transform((v) => normalizeInstagram(v)).optional(),
    city: optionalText(80).transform((v) => normalizeCity(v)).optional(),
    notes: optionalText(2000).optional(),
    how_met: optionalText(200).optional(),
    invite_status: z.enum(INVITE_STATUSES).optional(),
    ok_to_contact: z.boolean().optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(25).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.email && !isValidEmail(val.email)) {
      ctx.addIssue({ code: 'custom', path: ['email'], message: 'That email looks off' })
    }
    if (val.phone && !isPlausiblePhone(val.phone)) {
      ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Phone needs 7–15 digits' })
    }
    if (val.instagram && !isValidInstagram(val.instagram)) {
      ctx.addIssue({
        code: 'custom',
        path: ['instagram'],
        message: 'Instagram handles use letters, numbers, dots and underscores',
      })
    }
  })

export type ContactPatch = z.infer<typeof contactPatchSchema>

export const contactFiltersSchema = z.object({
  q: z.string().trim().max(200).optional().default(''),
  tags: z.array(z.string().uuid()).max(50).optional().default([]),
  tagMode: z.enum(['any', 'all']).optional().default('any'),
  city: z.string().trim().max(80).optional().default(''),
  status: z.enum(INVITE_STATUSES).or(z.literal('')).optional().default(''),
  sort: z.enum(CONTACT_SORTS).optional().default('newest'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(DEFAULT_PAGE_SIZE),
})

export type ParsedContactFilters = z.infer<typeof contactFiltersSchema>

/** Bulk actions apply either to explicit ids or to everything matching filters. */
export const bulkTargetSchema = z.union([
  z.object({ ids: z.array(z.string().uuid()).min(1).max(5000) }),
  z.object({ filters: contactFiltersSchema.omit({ page: true, pageSize: true }) }),
])

export const bulkActionSchema = z.intersection(
  bulkTargetSchema,
  z.discriminatedUnion('action', [
    z.object({ action: z.literal('add_tag'), tag: z.string().trim().min(1).max(40) }),
    z.object({ action: z.literal('remove_tag'), tagId: z.string().uuid() }),
    z.object({ action: z.literal('set_status'), status: z.enum(INVITE_STATUSES) }),
    z.object({ action: z.literal('delete') }),
  ]),
)

export type BulkAction = z.infer<typeof bulkActionSchema>
/** What callers may send (filters fields optional; defaults applied server-side). */
export type BulkActionInput = z.input<typeof bulkActionSchema>

export const tagRenameSchema = z.object({ name: z.string().trim().min(1).max(40) })
export const tagMergeSchema = z.object({ targetTagId: z.string().uuid() })

// ── URL <-> filters ─────────────────────────────────────────

export function filtersToSearchParams(f: ContactFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.tags && f.tags.length) p.set('tags', f.tags.join(','))
  if (f.tagMode && f.tagMode !== 'any') p.set('tagMode', f.tagMode)
  if (f.city) p.set('city', f.city)
  if (f.status) p.set('status', f.status)
  if (f.sort && f.sort !== 'newest') p.set('sort', f.sort)
  if (f.page && f.page > 1) p.set('page', String(f.page))
  return p
}

export function searchParamsToFilters(p: URLSearchParams): ContactFilters {
  const tags = (p.get('tags') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const status = p.get('status') ?? ''
  const sort = p.get('sort') ?? 'newest'
  const tagMode = p.get('tagMode') === 'all' ? 'all' : 'any'
  const page = Number(p.get('page') ?? '1')
  return {
    q: p.get('q') ?? '',
    tags,
    tagMode,
    city: p.get('city') ?? '',
    status: (INVITE_STATUSES as readonly string[]).includes(status) ? (status as InviteStatus) : '',
    sort: (CONTACT_SORTS as readonly string[]).includes(sort) ? (sort as ContactSort) : 'newest',
    page: Number.isFinite(page) && page > 1 ? Math.floor(page) : 1,
  }
}

// ── Export helpers ──────────────────────────────────────────

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function contactsToCsv(rows: Contact[]): string {
  const header = [
    'Name',
    'Email',
    'Phone',
    'Instagram',
    'City',
    'Tags',
    'Invite status',
    'OK to contact',
    'How met',
    'Notes',
    'Added',
  ]
  const lines = rows.map((c) =>
    [
      c.name,
      c.email,
      c.phone,
      c.instagram,
      c.city,
      c.tags.map((t) => t.name).join('; '),
      INVITE_STATUS_LABELS[c.invite_status],
      c.ok_to_contact ? 'yes' : 'no',
      c.how_met,
      c.notes,
      c.created_at,
    ]
      .map(csvCell)
      .join(','),
  )
  return [header.join(','), ...lines].join('\r\n')
}

export function contactsToEmailList(rows: Contact[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of rows) {
    if (c.email && !seen.has(c.email)) {
      seen.add(c.email)
      out.push(c.email)
    }
  }
  return out.join(', ')
}

export function instagramUrl(handle: string): string {
  return `https://instagram.com/${encodeURIComponent(handle)}`
}
