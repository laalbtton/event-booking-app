/**
 * Server-side CRM data access. Uses the service-role client, so EVERY query
 * must scope by owner_id explicitly — RLS is a second line of defence for
 * client-side access, not for these routes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Contact,
  type ContactInput,
  type ContactPatch,
  type ParsedContactFilters,
  type Tag,
  normalizeTagName,
} from '@/lib/crm'

type Db = SupabaseClient

type ContactRow = Omit<Contact, 'tags'> & {
  contact_tags?: Array<{ tag_id: string; tags: { id: string; name: string } | null }> | null
}

const CONTACT_SELECT = '*, contact_tags(tag_id, tags(id, name))'

function rowToContact(row: ContactRow): Contact {
  const tags: Tag[] = (row.contact_tags ?? [])
    .map((ct) => ct.tags)
    .filter((t): t is { id: string; name: string } => Boolean(t))
    .sort((a, b) => a.name.localeCompare(b.name))
  const { contact_tags: _ignored, ...rest } = row
  void _ignored
  return { ...rest, tags }
}

export class CrmError extends Error {
  status: number
  /** For duplicates: the existing contact the user collided with. */
  existing?: Contact
  constructor(message: string, status = 400, existing?: Contact) {
    super(message)
    this.status = status
    this.existing = existing
  }
}

// ── Tags ────────────────────────────────────────────────────

export async function listTagsWithCounts(db: Db, ownerId: string): Promise<Tag[]> {
  const { data: tags, error } = await db
    .from('tags')
    .select('id, name')
    .eq('owner_id', ownerId)
    .order('name')
  if (error) throw new CrmError(error.message, 500)
  if (!tags?.length) return []

  // Counts: one round trip, group client-side (tag sets are small per user).
  const { data: links, error: linkErr } = await db
    .from('contact_tags')
    .select('tag_id')
    .in(
      'tag_id',
      tags.map((t) => t.id),
    )
  if (linkErr) throw new CrmError(linkErr.message, 500)
  const counts = new Map<string, number>()
  for (const l of links ?? []) counts.set(l.tag_id, (counts.get(l.tag_id) ?? 0) + 1)
  return tags.map((t) => ({ id: t.id, name: t.name, count: counts.get(t.id) ?? 0 }))
}

/** Resolves tag names to ids, creating any that don't exist for this owner. */
export async function ensureTagIds(db: Db, ownerId: string, names: string[]): Promise<string[]> {
  const cleaned = Array.from(
    new Map(names.map(normalizeTagName).filter(Boolean).map((n) => [n.toLowerCase(), n])).values(),
  )
  if (!cleaned.length) return []

  const { data: existing, error } = await db
    .from('tags')
    .select('id, name')
    .eq('owner_id', ownerId)
  if (error) throw new CrmError(error.message, 500)

  const byLower = new Map((existing ?? []).map((t) => [t.name.toLowerCase(), t.id]))
  const missing = cleaned.filter((n) => !byLower.has(n.toLowerCase()))
  if (missing.length) {
    const { data: created, error: insErr } = await db
      .from('tags')
      .insert(missing.map((name) => ({ owner_id: ownerId, name })))
      .select('id, name')
    if (insErr) throw new CrmError(insErr.message, 500)
    for (const t of created ?? []) byLower.set(t.name.toLowerCase(), t.id)
  }
  return cleaned.map((n) => byLower.get(n.toLowerCase())!).filter(Boolean)
}

async function setContactTags(db: Db, contactId: string, tagIds: string[]) {
  const { error: delErr } = await db.from('contact_tags').delete().eq('contact_id', contactId)
  if (delErr) throw new CrmError(delErr.message, 500)
  if (tagIds.length) {
    const { error } = await db
      .from('contact_tags')
      .insert(tagIds.map((tag_id) => ({ contact_id: contactId, tag_id })))
    if (error) throw new CrmError(error.message, 500)
  }
}

export async function renameTag(db: Db, ownerId: string, tagId: string, name: string) {
  const { error } = await db
    .from('tags')
    .update({ name: normalizeTagName(name) })
    .eq('owner_id', ownerId)
    .eq('id', tagId)
  if (error) {
    if (error.code === '23505') throw new CrmError('You already have a tag with that name', 409)
    throw new CrmError(error.message, 500)
  }
}

export async function mergeTags(db: Db, ownerId: string, sourceId: string, targetId: string) {
  // Verify both belong to owner before touching anything.
  const { data: owned, error } = await db
    .from('tags')
    .select('id')
    .eq('owner_id', ownerId)
    .in('id', [sourceId, targetId])
  if (error) throw new CrmError(error.message, 500)
  if ((owned ?? []).length !== 2 && sourceId !== targetId) {
    throw new CrmError('Tag not found', 404)
  }
  const { data, error: rpcErr } = await db.rpc('crm_merge_tags', {
    source_tag_id: sourceId,
    target_tag_id: targetId,
  })
  if (rpcErr) throw new CrmError(rpcErr.message, 500)
  return Number(data ?? 0)
}

export async function deleteTag(db: Db, ownerId: string, tagId: string) {
  const { error } = await db.from('tags').delete().eq('owner_id', ownerId).eq('id', tagId)
  if (error) throw new CrmError(error.message, 500)
}

// ── Contacts ────────────────────────────────────────────────

export async function getContact(db: Db, ownerId: string, id: string): Promise<Contact | null> {
  const { data, error } = await db
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('owner_id', ownerId)
    .eq('id', id)
    .maybeSingle()
  if (error) throw new CrmError(error.message, 500)
  return data ? rowToContact(data as ContactRow) : null
}

/**
 * Finds an existing contact sharing any contact method. Used both to give the
 * inline "already in your list" warning and to turn unique violations into a
 * friendly 409 that carries the colliding contact.
 */
export async function findDuplicate(
  db: Db,
  ownerId: string,
  input: { email?: string | null; phone?: string | null; instagram?: string | null },
  excludeId?: string,
): Promise<Contact | null> {
  const ors: string[] = []
  if (input.email) ors.push(`email.eq.${escapeFilterValue(input.email)}`)
  if (input.phone) ors.push(`phone.eq.${escapeFilterValue(input.phone)}`)
  if (input.instagram) ors.push(`instagram.eq.${escapeFilterValue(input.instagram)}`)
  if (!ors.length) return null

  let q = db.from('contacts').select(CONTACT_SELECT).eq('owner_id', ownerId).or(ors.join(','))
  if (excludeId) q = q.neq('id', excludeId)
  const { data, error } = await q.limit(1).maybeSingle()
  if (error) throw new CrmError(error.message, 500)
  return data ? rowToContact(data as ContactRow) : null
}

function escapeFilterValue(v: string): string {
  // PostgREST: wrap in double quotes when the value contains reserved chars.
  return /[,.()"\\]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v
}

export async function createContact(db: Db, ownerId: string, input: ContactInput): Promise<Contact> {
  const dup = await findDuplicate(db, ownerId, input)
  if (dup) throw new CrmError(`${dup.name} is already in your list`, 409, dup)

  const { tags, ...fields } = input
  const { data, error } = await db
    .from('contacts')
    .insert({ ...fields, owner_id: ownerId })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      const again = await findDuplicate(db, ownerId, input)
      throw new CrmError('That person is already in your list', 409, again ?? undefined)
    }
    throw new CrmError(error.message, 500)
  }

  const tagIds = await ensureTagIds(db, ownerId, tags)
  if (tagIds.length) await setContactTags(db, data.id, tagIds)

  const created = await getContact(db, ownerId, data.id)
  if (!created) throw new CrmError('Contact vanished after insert', 500)
  return created
}

export async function updateContact(
  db: Db,
  ownerId: string,
  id: string,
  patch: ContactPatch,
): Promise<Contact> {
  const current = await getContact(db, ownerId, id)
  if (!current) throw new CrmError('Contact not found', 404)

  const { tags, ...fields } = patch
  const merged = {
    email: fields.email === undefined ? current.email : fields.email,
    phone: fields.phone === undefined ? current.phone : fields.phone,
    instagram: fields.instagram === undefined ? current.instagram : fields.instagram,
  }
  if (!merged.email && !merged.phone && !merged.instagram) {
    throw new CrmError('Keep at least one way to reach them: email, phone, or Instagram', 400)
  }
  const dup = await findDuplicate(db, ownerId, merged, id)
  if (dup) throw new CrmError(`${dup.name} already has that contact info`, 409, dup)

  if (Object.keys(fields).length) {
    const { error } = await db.from('contacts').update(fields).eq('owner_id', ownerId).eq('id', id)
    if (error) {
      if (error.code === '23505') throw new CrmError('Another contact already has that info', 409)
      throw new CrmError(error.message, 500)
    }
  }
  if (tags !== undefined) {
    const tagIds = await ensureTagIds(db, ownerId, tags)
    await setContactTags(db, id, tagIds)
  }
  const updated = await getContact(db, ownerId, id)
  if (!updated) throw new CrmError('Contact not found', 404)
  return updated
}

export async function deleteContacts(db: Db, ownerId: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const { data, error } = await db
    .from('contacts')
    .delete()
    .eq('owner_id', ownerId)
    .in('id', ids)
    .select('id')
  if (error) throw new CrmError(error.message, 500)
  return data?.length ?? 0
}

// ── Listing / filtering ─────────────────────────────────────

/**
 * Resolves the set of contact ids that match the tag filter. Returns null
 * when no tag filter is active (meaning "don't restrict").
 */
async function contactIdsForTags(
  db: Db,
  tagIds: string[],
  mode: 'any' | 'all',
): Promise<string[] | null> {
  if (!tagIds.length) return null
  const { data, error } = await db.from('contact_tags').select('contact_id, tag_id').in('tag_id', tagIds)
  if (error) throw new CrmError(error.message, 500)
  const perContact = new Map<string, Set<string>>()
  for (const row of data ?? []) {
    if (!perContact.has(row.contact_id)) perContact.set(row.contact_id, new Set())
    perContact.get(row.contact_id)!.add(row.tag_id)
  }
  const out: string[] = []
  for (const [cid, set] of perContact) {
    if (mode === 'any' || set.size === tagIds.length) out.push(cid)
  }
  return out
}

type FilterableQuery<T> = {
  ilike(column: string, value: string): T
  eq(column: string, value: string): T
  or(filters: string): T
}

function applyScalarFilters<T extends FilterableQuery<T>>(q: T, f: ParsedContactFilters): T {
  let query = q
  if (f.city) query = query.ilike('city', f.city)
  if (f.status) query = query.eq('invite_status', f.status)
  if (f.q) {
    const term = `%${f.q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const safe = escapeFilterValue(term)
    const digits = f.q.replace(/\D/g, '')
    const ors = [
      `name.ilike.${safe}`,
      `email.ilike.${safe}`,
      `instagram.ilike.${safe}`,
      `notes.ilike.${safe}`,
      `city.ilike.${safe}`,
    ]
    if (digits.length >= 3) ors.push(`phone.ilike.${escapeFilterValue(`%${digits}%`)}`)
    query = query.or(ors.join(','))
  }
  return query
}

export async function listContacts(
  db: Db,
  ownerId: string,
  f: ParsedContactFilters,
): Promise<{ contacts: Contact[]; total: number; page: number; pageSize: number }> {
  const idsForTags = await contactIdsForTags(db, f.tags, f.tagMode)
  if (idsForTags && idsForTags.length === 0) {
    return { contacts: [], total: 0, page: f.page, pageSize: f.pageSize }
  }

  let q = db.from('contacts').select(CONTACT_SELECT, { count: 'exact' }).eq('owner_id', ownerId)
  if (idsForTags) q = q.in('id', idsForTags)
  q = applyScalarFilters(q, f)

  switch (f.sort) {
    case 'name':
      q = q.order('name', { ascending: true }).order('created_at', { ascending: false })
      break
    case 'city':
      q = q
        .order('city', { ascending: true, nullsFirst: false })
        .order('name', { ascending: true })
      break
    default:
      q = q.order('created_at', { ascending: false })
  }

  const from = (f.page - 1) * f.pageSize
  const { data, error, count } = await q.range(from, from + f.pageSize - 1)
  if (error) throw new CrmError(error.message, 500)
  return {
    contacts: ((data ?? []) as ContactRow[]).map(rowToContact),
    total: count ?? 0,
    page: f.page,
    pageSize: f.pageSize,
  }
}

/** All matching ids (no pagination) — used by bulk actions and export. */
export async function listMatchingIds(db: Db, ownerId: string, f: ParsedContactFilters): Promise<string[]> {
  const idsForTags = await contactIdsForTags(db, f.tags, f.tagMode)
  if (idsForTags && idsForTags.length === 0) return []
  let q = db.from('contacts').select('id').eq('owner_id', ownerId)
  if (idsForTags) q = q.in('id', idsForTags)
  q = applyScalarFilters(q, f)
  const { data, error } = await q.limit(5000)
  if (error) throw new CrmError(error.message, 500)
  return (data ?? []).map((r) => r.id)
}

export async function getContactsByIds(db: Db, ownerId: string, ids: string[]): Promise<Contact[]> {
  if (!ids.length) return []
  const out: Contact[] = []
  // PostgREST URL length limits — chunk the IN list.
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await db
      .from('contacts')
      .select(CONTACT_SELECT)
      .eq('owner_id', ownerId)
      .in('id', chunk)
      .order('name')
    if (error) throw new CrmError(error.message, 500)
    out.push(...((data ?? []) as ContactRow[]).map(rowToContact))
  }
  return out
}

/** Distinct cities for the filter dropdown. */
export async function listCities(db: Db, ownerId: string): Promise<string[]> {
  const { data, error } = await db
    .from('contacts')
    .select('city')
    .eq('owner_id', ownerId)
    .not('city', 'is', null)
    .limit(5000)
  if (error) throw new CrmError(error.message, 500)
  const seen = new Map<string, string>()
  for (const r of data ?? []) {
    const c = (r.city as string | null)?.trim()
    if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c)
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
}

// ── Bulk ────────────────────────────────────────────────────

export async function bulkAddTag(db: Db, ownerId: string, ids: string[], tagName: string) {
  const [tagId] = await ensureTagIds(db, ownerId, [tagName])
  if (!tagId || !ids.length) return 0
  // Guard against ids that aren't ours.
  const { data: owned, error } = await db.from('contacts').select('id').eq('owner_id', ownerId).in('id', ids)
  if (error) throw new CrmError(error.message, 500)
  const rows = (owned ?? []).map((r) => ({ contact_id: r.id, tag_id: tagId }))
  if (!rows.length) return 0
  const { error: upErr } = await db.from('contact_tags').upsert(rows, { onConflict: 'contact_id,tag_id', ignoreDuplicates: true })
  if (upErr) throw new CrmError(upErr.message, 500)
  return rows.length
}

export async function bulkRemoveTag(db: Db, ownerId: string, ids: string[], tagId: string) {
  if (!ids.length) return 0
  const { data: tag } = await db.from('tags').select('id').eq('owner_id', ownerId).eq('id', tagId).maybeSingle()
  if (!tag) throw new CrmError('Tag not found', 404)
  const { data, error } = await db
    .from('contact_tags')
    .delete()
    .eq('tag_id', tagId)
    .in('contact_id', ids)
    .select('contact_id')
  if (error) throw new CrmError(error.message, 500)
  return data?.length ?? 0
}

export async function bulkSetStatus(db: Db, ownerId: string, ids: string[], status: Contact['invite_status']) {
  if (!ids.length) return 0
  const { data, error } = await db
    .from('contacts')
    .update({ invite_status: status })
    .eq('owner_id', ownerId)
    .in('id', ids)
    .select('id')
  if (error) throw new CrmError(error.message, 500)
  return data?.length ?? 0
}
