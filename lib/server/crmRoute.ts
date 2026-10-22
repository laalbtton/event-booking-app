import { NextResponse } from 'next/server'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ZodError } from 'zod'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { contactFiltersSchema, type ParsedContactFilters } from '@/lib/crm'
import { CrmError } from '@/lib/server/crm'

type AuthOk = { ok: true; db: SupabaseClient; user: User }
type AuthFail = { ok: false; response: NextResponse }

/** Any signed-in user may use the CRM; data is scoped to their own rows. */
export async function requireCrmUser(request: Request): Promise<AuthOk | AuthFail> {
  const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { ok: true, db: supabase, user }
}

export function parseFiltersFromUrl(url: URL): ParsedContactFilters {
  const sp = url.searchParams
  return contactFiltersSchema.parse({
    q: sp.get('q') ?? undefined,
    tags: (sp.get('tags') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    tagMode: sp.get('tagMode') ?? undefined,
    city: sp.get('city') ?? undefined,
    status: sp.get('status') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    page: sp.get('page') ?? undefined,
    pageSize: sp.get('pageSize') ?? undefined,
  })
}

export function crmErrorResponse(error: unknown): NextResponse {
  if (error instanceof CrmError) {
    return NextResponse.json(
      { error: error.message, existing: error.existing ?? null },
      { status: error.status },
    )
  }
  if (error instanceof ZodError) {
    const first = error.issues[0]
    return NextResponse.json(
      {
        error: first?.message ?? 'Invalid input',
        field: first?.path?.[0] ?? null,
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    )
  }
  console.error('CRM API error:', error)
  const message = error instanceof Error ? error.message : 'Unexpected error'
  return NextResponse.json({ error: message }, { status: 500 })
}
