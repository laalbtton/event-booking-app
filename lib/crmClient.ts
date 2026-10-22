'use client'

/**
 * Browser-side fetch helpers for /api/crm/*. Attaches the Supabase access
 * token as a Bearer header, matching the rest of the app's API routes.
 */
import { supabase } from '@/lib/supabase'
import {
  type BulkActionInput,
  type Contact,
  type ContactFilters,
  type ContactInput,
  type ContactPatch,
  type Tag,
  filtersToSearchParams,
} from '@/lib/crm'

export class CrmApiError extends Error {
  status: number
  field: string | null
  existing: Contact | null
  constructor(message: string, status: number, field: string | null = null, existing: Contact | null = null) {
    super(message)
    this.status = status
    this.field = field
    this.existing = existing
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new CrmApiError('Please sign in again', 401)
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await authHeaders()
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
  const body = (await res.json().catch(() => ({}))) as {
    error?: string
    field?: string | null
    existing?: Contact | null
  } & T
  if (!res.ok) {
    throw new CrmApiError(body.error || `Request failed (${res.status})`, res.status, body.field ?? null, body.existing ?? null)
  }
  return body
}

export type ContactsPage = {
  contacts: Contact[]
  total: number
  page: number
  pageSize: number
  tags: Tag[]
  cities: string[]
}

export function fetchContacts(filters: ContactFilters, pageSize?: number): Promise<ContactsPage> {
  const params = filtersToSearchParams(filters)
  if (pageSize) params.set('pageSize', String(pageSize))
  return request<ContactsPage>(`/api/crm/contacts?${params.toString()}`)
}

export async function checkDuplicate(input: {
  email?: string | null
  phone?: string | null
  instagram?: string | null
}): Promise<Contact | null> {
  const p = new URLSearchParams({ dupCheck: '1' })
  if (input.email) p.set('email', input.email)
  if (input.phone) p.set('phone', input.phone)
  if (input.instagram) p.set('instagram', input.instagram)
  const { existing } = await request<{ existing: Contact | null }>(`/api/crm/contacts?${p.toString()}`)
  return existing
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const { contact } = await request<{ contact: Contact }>('/api/crm/contacts', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return contact
}

export async function updateContact(id: string, patch: ContactPatch): Promise<Contact> {
  const { contact } = await request<{ contact: Contact }>(`/api/crm/contacts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
  return contact
}

export async function deleteContact(id: string): Promise<void> {
  await request(`/api/crm/contacts/${id}`, { method: 'DELETE' })
}

export async function bulkAction(action: BulkActionInput): Promise<{ affected: number; targeted: number }> {
  return request('/api/crm/contacts/bulk', { method: 'POST', body: JSON.stringify(action) })
}

export type ExportTarget = { ids: string[] } | { filters: Omit<ContactFilters, 'page' | 'pageSize'> }

export async function exportContacts(
  target: ExportTarget,
  format: 'csv' | 'emails',
): Promise<{ content: string; count: number; filename: string }> {
  return request('/api/crm/contacts/export', {
    method: 'POST',
    body: JSON.stringify({ ...target, format }),
  })
}

export async function fetchTags(): Promise<Tag[]> {
  const { tags } = await request<{ tags: Tag[] }>('/api/crm/tags')
  return tags
}

export async function renameTag(id: string, name: string): Promise<Tag[]> {
  const { tags } = await request<{ tags: Tag[] }>(`/api/crm/tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  return tags
}

export async function mergeTag(sourceId: string, targetTagId: string): Promise<{ tags: Tag[]; moved: number }> {
  return request(`/api/crm/tags/${sourceId}`, {
    method: 'POST',
    body: JSON.stringify({ targetTagId }),
  })
}

export async function deleteTag(id: string): Promise<Tag[]> {
  const { tags } = await request<{ tags: Tag[] }>(`/api/crm/tags/${id}`, { method: 'DELETE' })
  return tags
}
