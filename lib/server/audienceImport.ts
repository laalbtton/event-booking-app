import type { SupabaseClient } from '@supabase/supabase-js'
import type { AudienceRowInput } from '@/lib/audienceImport'
import { addContactToSegment, getWelcomeSegmentId, upsertContact } from '@/lib/server/resendAudience'

export const AUDIENCE_SOURCE_SIGNUP_SHEET = 'event_signup_sheet'

type ExistingMember = {
  id: string
  email: string
  first_name: string | null
  phone: string | null
  language_preferences: unknown
  profile_user_id: string | null
  imported_at: string | null
  attended_event_count: number | null
}

export type ImportResultRow = {
  email: string
  name: string | null
  outcome: 'added' | 'updated' | 'failed'
  matchedProfile: boolean
  resendSynced: boolean
  error?: string
}

export type ImportBatchResult = {
  batchId: string
  rowCount: number
  addedCount: number
  existingCount: number
  invalidCount: number
  matchedProfileCount: number
  resendFailures: number
  welcomeSegmentConfigured: boolean
  rows: ImportResultRow[]
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function mergeLanguages(existing: unknown, incoming: string[]): string[] {
  const out = asStringArray(existing)
  for (const l of incoming) if (!out.includes(l)) out.push(l)
  return out
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Import one batch of sign-up-sheet rows:
 *   1. create an audience_signup_imports row
 *   2. upsert each person into founding_members (the canonical email list)
 *   3. link to an existing app profile where the email matches
 *   4. push to Resend (main segment + welcome queue segment)
 *
 * Rows must already be validated with prepareRows() — pass only status 'ok'.
 */
export async function importAudienceRows(
  supabase: SupabaseClient,
  opts: {
    rows: AudienceRowInput[]
    invalidCount: number
    eventId: string | null
    eventDate: string | null
    consentText: string
    createdBy: string
  },
): Promise<ImportBatchResult> {
  const { rows, eventId, consentText, createdBy } = opts
  const nowIso = new Date().toISOString()
  const welcomeSegmentId = getWelcomeSegmentId()

  const { data: batch, error: batchError } = await supabase
    .from('audience_signup_imports')
    .insert({
      event_id: eventId,
      created_by: createdBy,
      consent_text: consentText,
      row_count: rows.length + opts.invalidCount,
      invalid_count: opts.invalidCount,
    })
    .select('id')
    .single()
  if (batchError || !batch) {
    throw new Error(batchError?.message || 'Could not create import batch')
  }
  const batchId = batch.id as string

  const emails = rows.map((r) => r.email)

  const existingByEmail = new Map<string, ExistingMember>()
  const profileByEmail = new Map<string, string>()
  for (const group of chunk(emails, 200)) {
    const { data: existing } = await supabase
      .from('founding_members')
      .select('id, email, first_name, phone, language_preferences, profile_user_id, imported_at, attended_event_count')
      .in('email', group)
    for (const m of (existing || []) as ExistingMember[]) existingByEmail.set(m.email.toLowerCase(), m)

    const { data: profiles } = await supabase.from('profiles').select('id, email').in('email', group)
    for (const p of (profiles || []) as Array<{ id: string; email: string | null }>) {
      if (p.email) profileByEmail.set(p.email.toLowerCase(), p.id)
    }
  }

  const results: ImportResultRow[] = []
  let addedCount = 0
  let existingCount = 0
  let matchedProfileCount = 0
  let resendFailures = 0

  for (const row of rows) {
    const existing = existingByEmail.get(row.email)
    const profileUserId = existing?.profile_user_id || profileByEmail.get(row.email) || null
    const matchedProfile = !!profileUserId
    if (matchedProfile) matchedProfileCount += 1

    const sharedFields = {
      email_updates_opt_in: true,
      consent_text: consentText,
      consent_recorded_at: opts.eventDate || nowIso,
      import_batch_id: batchId,
      profile_user_id: profileUserId,
      ...(eventId
        ? { last_attended_event_id: eventId, last_attended_at: opts.eventDate || nowIso }
        : {}),
      updated_at: nowIso,
    }

    let dbError: string | undefined
    if (existing) {
      const { error } = await supabase
        .from('founding_members')
        .update({
          ...sharedFields,
          first_name: existing.first_name || row.name,
          phone: existing.phone || row.phone,
          language_preferences: mergeLanguages(existing.language_preferences, row.languages),
          imported_at: existing.imported_at || nowIso,
          attended_event_count: (existing.attended_event_count || 0) + (eventId ? 1 : 0),
        })
        .eq('id', existing.id)
      dbError = error?.message
      if (!dbError) existingCount += 1
    } else {
      const { error } = await supabase.from('founding_members').insert({
        ...sharedFields,
        email: row.email,
        first_name: row.name,
        phone: row.phone,
        language_preferences: row.languages,
        source: AUDIENCE_SOURCE_SIGNUP_SHEET,
        source_event_id: eventId,
        imported_at: nowIso,
        attended_event_count: eventId ? 1 : 0,
        app_account_activated: matchedProfile,
        created_at: nowIso,
      })
      dbError = error?.message
      if (!dbError) addedCount += 1
    }

    if (dbError) {
      results.push({ email: row.email, name: row.name, outcome: 'failed', matchedProfile, resendSynced: false, error: dbError })
      continue
    }

    // Resend: main list + welcome queue. contacts.create is an upsert for the
    // main segment; for an already-existing contact the extra segment is not
    // always applied, so add it explicitly too (idempotent).
    const firstName = row.name ? row.name.split(' ')[0] : existing?.first_name || null
    const upsert = await upsertContact(row.email, firstName, welcomeSegmentId ? [welcomeSegmentId] : [])
    let resendSynced = upsert.success
    let resendError: string | undefined = upsert.success ? undefined : upsert.error
    if (upsert.success && welcomeSegmentId) {
      const add = await addContactToSegment(row.email, welcomeSegmentId)
      resendSynced = add.success
      if (!add.success) resendError = add.error
    }
    if (!resendSynced) resendFailures += 1

    results.push({
      email: row.email,
      name: row.name,
      outcome: existing ? 'updated' : 'added',
      matchedProfile,
      resendSynced,
      error: resendError,
    })
  }

  await supabase
    .from('audience_signup_imports')
    .update({
      added_count: addedCount,
      existing_count: existingCount,
      matched_profile_count: matchedProfileCount,
    })
    .eq('id', batchId)

  return {
    batchId,
    rowCount: rows.length + opts.invalidCount,
    addedCount,
    existingCount,
    invalidCount: opts.invalidCount,
    matchedProfileCount,
    resendFailures,
    welcomeSegmentConfigured: !!welcomeSegmentId,
    rows: results,
  }
}
