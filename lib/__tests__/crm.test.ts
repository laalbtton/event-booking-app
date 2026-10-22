import { describe, expect, it } from 'vitest'
import {
  contactInputSchema,
  contactsToCsv,
  contactsToEmailList,
  filtersToSearchParams,
  formatPhoneForDisplay,
  isValidEmail,
  normalizeEmail,
  normalizeInstagram,
  normalizePhone,
  normalizeTagName,
  searchParamsToFilters,
  type Contact,
} from '../crm'

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Sunny@Example.COM ')).toBe('sunny@example.com')
  })
  it('returns null for empty', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
})

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('a@b.co')).toBe(true)
    expect(isValidEmail('first.last+tag@sub.domain.org')).toBe(true)
  })
  it('rejects junk', () => {
    expect(isValidEmail('nope')).toBe(false)
    expect(isValidEmail('a@b')).toBe(false)
    expect(isValidEmail('a b@c.com')).toBe(false)
  })
})

describe('normalizePhone', () => {
  it('turns 10-digit NA numbers into +1', () => {
    expect(normalizePhone('(416) 555-0100')).toBe('+14165550100')
    expect(normalizePhone('416.555.0100')).toBe('+14165550100')
  })
  it('keeps explicit country codes', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958')
    expect(normalizePhone('1 416 555 0100')).toBe('+14165550100')
  })
  it('collides equivalent formats', () => {
    expect(normalizePhone('416-555-0100')).toBe(normalizePhone('+1 (416) 555 0100'))
  })
  it('returns null for empty / non-digit', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('call me')).toBeNull()
  })
  it('formats for display', () => {
    expect(formatPhoneForDisplay('+14165550100')).toBe('(416) 555-0100')
    expect(formatPhoneForDisplay('+442079460958')).toBe('+442079460958')
  })
})

describe('normalizeInstagram', () => {
  it('strips @', () => {
    expect(normalizeInstagram('@Sunny_C')).toBe('sunny_c')
  })
  it('strips URLs with and without www / trailing slash / query', () => {
    expect(normalizeInstagram('https://www.instagram.com/sunny_c/')).toBe('sunny_c')
    expect(normalizeInstagram('instagram.com/sunny_c?hl=en')).toBe('sunny_c')
    expect(normalizeInstagram('http://instagram.com/@sunny_c')).toBe('sunny_c')
  })
  it('returns null for empty', () => {
    expect(normalizeInstagram('')).toBeNull()
    expect(normalizeInstagram('@')).toBeNull()
  })
})

describe('normalizeTagName', () => {
  it('collapses whitespace and caps length', () => {
    expect(normalizeTagName('  Open   Mic  ')).toBe('Open Mic')
    expect(normalizeTagName('x'.repeat(100))).toHaveLength(40)
  })
})

describe('contactInputSchema', () => {
  it('requires a name', () => {
    const r = contactInputSchema.safeParse({ name: '', email: 'a@b.co' })
    expect(r.success).toBe(false)
  })
  it('requires at least one contact method', () => {
    const r = contactInputSchema.safeParse({ name: 'Sunny' })
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['email'])
  })
  it('normalizes every field on the way through', () => {
    const r = contactInputSchema.safeParse({
      name: '  Sunny ',
      email: 'Sunny@Example.com',
      phone: '416 555 0100',
      instagram: 'https://instagram.com/Sunny_C/',
      city: '  Brampton ',
      tags: ['Brampton', 'regular'],
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data).toMatchObject({
        name: 'Sunny',
        email: 'sunny@example.com',
        phone: '+14165550100',
        instagram: 'sunny_c',
        city: 'Brampton',
        invite_status: 'not_invited',
        ok_to_contact: false,
        tags: ['Brampton', 'regular'],
      })
    }
  })
  it('rejects invalid email / instagram', () => {
    expect(contactInputSchema.safeParse({ name: 'x', email: 'nope' }).success).toBe(false)
    expect(contactInputSchema.safeParse({ name: 'x', instagram: 'has space' }).success).toBe(false)
  })
  it('rejects phones that are too short', () => {
    expect(contactInputSchema.safeParse({ name: 'x', phone: '12' }).success).toBe(false)
  })
})

describe('filters <-> URL', () => {
  it('round-trips', () => {
    const f = {
      q: 'sun',
      tags: ['11111111-1111-1111-1111-111111111111'],
      tagMode: 'all' as const,
      city: 'Brampton',
      status: 'invited' as const,
      sort: 'name' as const,
      page: 2,
    }
    const back = searchParamsToFilters(filtersToSearchParams(f))
    expect(back).toEqual(f)
  })
  it('drops defaults from the URL', () => {
    expect(filtersToSearchParams({ sort: 'newest', tagMode: 'any', page: 1 }).toString()).toBe('')
  })
  it('ignores garbage values', () => {
    const back = searchParamsToFilters(new URLSearchParams('status=bogus&sort=bogus&page=-3'))
    expect(back.status).toBe('')
    expect(back.sort).toBe('newest')
    expect(back.page).toBe(1)
  })
})

describe('export helpers', () => {
  const base: Contact = {
    id: '1',
    owner_id: 'o',
    name: 'Sunny "The Kid" Chahal',
    email: 'sunny@example.com',
    phone: '+14165550100',
    instagram: 'sunny_c',
    city: 'Brampton',
    notes: 'Line one,\nline two',
    how_met: null,
    invite_status: 'invited',
    ok_to_contact: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    tags: [{ id: 't1', name: 'Brampton' }],
  }
  it('escapes quotes, commas and newlines in CSV', () => {
    const csv = contactsToCsv([base])
    const lines = csv.split('\r\n')
    expect(lines[0]).toContain('Name,Email,Phone')
    expect(lines[1]).toContain('"Sunny ""The Kid"" Chahal"')
    expect(lines[1]).toContain('"Line one,\nline two"')
  })
  it('dedupes emails', () => {
    expect(contactsToEmailList([base, { ...base, id: '2' }, { ...base, id: '3', email: null }])).toBe('sunny@example.com')
  })
})
