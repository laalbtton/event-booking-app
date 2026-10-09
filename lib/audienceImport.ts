/**
 * Audience sign-up sheet parsing — shared by the admin UI (live preview)
 * and the import API (server-side validation).
 *
 * Input is whatever the admin pastes from Excel (tab-separated) or a CSV
 * file. We auto-detect the delimiter, auto-detect a header row, and let the
 * admin override which column is name / email / phone / language.
 */

import { isValidEmail, normalizeEmail } from '@/lib/foundingMembers'

export type AudienceField = 'name' | 'email' | 'phone' | 'language' | 'ignore'

export type ColumnMapping = Record<number, AudienceField>

export type ParsedTable = {
  delimiter: '\t' | ',' | ';'
  hasHeader: boolean
  headers: string[]
  rows: string[][]
  mapping: ColumnMapping
}

export type AudienceRowInput = {
  name: string | null
  email: string
  phone: string | null
  languages: string[]
}

export type PreparedRow = AudienceRowInput & {
  rowNumber: number
  status: 'ok' | 'duplicate' | 'invalid'
  reason?: string
}

export const KNOWN_LANGUAGES = ['English', 'Hindi', 'Punjabi', 'Urdu', 'Gujarati', 'Tamil', 'Telugu', 'Bengali', 'Marathi', 'Malayalam', 'Kannada', 'Spanish', 'French'] as const

const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'English',
  eng: 'English',
  english: 'English',
  hi: 'Hindi',
  hin: 'Hindi',
  hindi: 'Hindi',
  pa: 'Punjabi',
  pb: 'Punjabi',
  pun: 'Punjabi',
  punjabi: 'Punjabi',
  panjabi: 'Punjabi',
  ur: 'Urdu',
  urdu: 'Urdu',
  hindustani: 'Hindi',
  'hindi/urdu': 'Hindi',
  gujarati: 'Gujarati',
  guj: 'Gujarati',
  tamil: 'Tamil',
  telugu: 'Telugu',
  bengali: 'Bengali',
  bangla: 'Bengali',
  marathi: 'Marathi',
  malayalam: 'Malayalam',
  kannada: 'Kannada',
  spanish: 'Spanish',
  french: 'French',
  both: 'English, Hindi',
  all: 'English, Hindi, Punjabi',
  any: 'English, Hindi, Punjabi',
}

/** "Eng / punjabi & hindi" → ["English", "Punjabi", "Hindi"] */
export function normalizeLanguages(raw: string | null | undefined): string[] {
  if (!raw) return []
  const out: string[] = []
  const push = (v: string) => {
    if (v && !out.includes(v)) out.push(v)
  }
  const tokens = raw
    .split(/[\/,;&+|]|\band\b/gi)
    .map((t) => t.trim())
    .filter(Boolean)
  for (const token of tokens) {
    const key = token.toLowerCase().replace(/\s+/g, ' ')
    const alias = LANGUAGE_ALIASES[key]
    if (alias) {
      alias.split(',').map((s) => s.trim()).forEach(push)
      continue
    }
    // Title-case unknown languages so "spanish" and "Spanish" merge.
    push(token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
  }
  return out
}

function detectDelimiter(text: string): '\t' | ',' | ';' {
  const sample = text.split(/\r?\n/).slice(0, 10).join('\n')
  const tabs = (sample.match(/\t/g) || []).length
  const commas = (sample.match(/,/g) || []).length
  const semis = (sample.match(/;/g) || []).length
  if (tabs > 0 && tabs >= commas) return '\t'
  if (semis > commas) return ';'
  return ','
}

/** Minimal RFC-4180-ish line splitter that handles quoted cells. */
function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === delimiter) {
      cells.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur)
  return cells.map((c) => c.trim())
}

const EMAIL_IN_TEXT = /[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+/

function guessField(header: string, sampleValues: string[]): AudienceField {
  const h = header.toLowerCase()
  if (/e-?mail/.test(h)) return 'email'
  if (/phone|mobile|cell|whatsapp|number|tel/.test(h)) return 'phone'
  if (/lang|language|prefer/.test(h)) return 'language'
  if (/name/.test(h)) return 'name'

  // No helpful header — look at the data.
  const nonEmpty = sampleValues.filter(Boolean)
  if (nonEmpty.length === 0) return 'ignore'
  const emailHits = nonEmpty.filter((v) => EMAIL_IN_TEXT.test(v)).length
  if (emailHits / nonEmpty.length > 0.5) return 'email'
  const phoneHits = nonEmpty.filter((v) => /^[+()\d\s.-]{7,}$/.test(v)).length
  if (phoneHits / nonEmpty.length > 0.5) return 'phone'
  const langHits = nonEmpty.filter((v) => normalizeLanguages(v).some((l) => (KNOWN_LANGUAGES as readonly string[]).includes(l))).length
  if (langHits / nonEmpty.length > 0.5) return 'language'
  return 'name'
}

export function parseAudienceText(text: string): ParsedTable {
  const delimiter = detectDelimiter(text)
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\u00a0/g, ' '))
    .filter((l) => l.trim().length > 0)

  if (lines.length === 0) {
    return { delimiter, hasHeader: false, headers: [], rows: [], mapping: {} }
  }

  let rows = lines.map((l) => splitLine(l, delimiter))
  const width = Math.max(...rows.map((r) => r.length))
  rows = rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill('')] : r))

  // Header detection: first row has no email and at least one cell looks like a label.
  const first = rows[0]
  const firstHasEmail = first.some((c) => EMAIL_IN_TEXT.test(c))
  const firstLooksLikeLabels = first.some((c) => /name|email|phone|lang|prefer|mobile/i.test(c))
  const hasHeader = !firstHasEmail && (firstLooksLikeLabels || rows.length > 1)

  const headers = hasHeader ? first : Array.from({ length: width }, (_, i) => `Column ${i + 1}`)
  const dataRows = hasHeader ? rows.slice(1) : rows

  const mapping: ColumnMapping = {}
  const used = new Set<AudienceField>()
  for (let col = 0; col < width; col += 1) {
    const samples = dataRows.slice(0, 15).map((r) => r[col] ?? '')
    let field = guessField(hasHeader ? headers[col] : '', samples)
    // Only one column per field — later duplicates are ignored.
    if (field !== 'ignore' && used.has(field)) field = 'ignore'
    used.add(field)
    mapping[col] = field
  }

  // Single-column paste of just emails: treat as email.
  if (width === 1 && !used.has('email')) mapping[0] = 'email'

  return { delimiter, hasHeader, headers, rows: dataRows, mapping }
}

function cleanName(raw: string): string | null {
  const v = raw.replace(/\s+/g, ' ').trim()
  if (!v) return null
  // Title-case all-caps or all-lowercase handwriting transcriptions.
  if (v === v.toUpperCase() || v === v.toLowerCase()) {
    return v
      .split(' ')
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
      .join(' ')
  }
  return v
}

function cleanPhone(raw: string): string | null {
  const v = raw.trim()
  if (!v) return null
  const digits = v.replace(/[^\d+]/g, '')
  return digits.length >= 7 ? v : null
}

/** Apply a column mapping to parsed rows and flag invalid / duplicate emails. */
export function prepareRows(rows: string[][], mapping: ColumnMapping): PreparedRow[] {
  const cols = Object.entries(mapping).reduce<Record<AudienceField, number | undefined>>(
    (acc, [idx, field]) => {
      if (field !== 'ignore' && acc[field] === undefined) acc[field] = Number(idx)
      return acc
    },
    { name: undefined, email: undefined, phone: undefined, language: undefined, ignore: undefined },
  )

  const seen = new Set<string>()
  return rows.map((cells, i) => {
    const rowNumber = i + 1
    const get = (f: AudienceField) => (cols[f] === undefined ? '' : cells[cols[f] as number] ?? '')

    let emailRaw = get('email')
    // Handwriting transcriptions sometimes land "Name <email>" or "email (note)" in one cell.
    const m = emailRaw.match(EMAIL_IN_TEXT)
    if (m) emailRaw = m[0]
    const email = normalizeEmail(emailRaw.replace(/[<>()]/g, ''))

    const base: AudienceRowInput = {
      name: cleanName(get('name')),
      email,
      phone: cleanPhone(get('phone')),
      languages: normalizeLanguages(get('language')),
    }

    if (!email) return { ...base, rowNumber, status: 'invalid', reason: 'No email' }
    if (!isValidEmail(email)) return { ...base, rowNumber, status: 'invalid', reason: 'Email looks wrong' }
    if (seen.has(email)) return { ...base, rowNumber, status: 'duplicate', reason: 'Repeated in this paste' }
    seen.add(email)
    return { ...base, rowNumber, status: 'ok' }
  })
}

export const DEFAULT_CASL_CONSENT_TEXT =
  'By providing my name and email, I consent to receive emails from One Mic Stand / Laal Button about upcoming comedy shows, open mics and events. I understand I can unsubscribe at any time using the link in any email.'
