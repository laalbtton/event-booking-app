import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { normalizePhone } from '@/lib/crm'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

export const dynamic = 'force-dynamic'

const requestSchema = z.object({
  phone: z.string().trim().min(1).max(40),
  body: z.string().trim().max(500).optional().nullable(),
  optOutType: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(80).optional().default('pabbly_twilio_inbound'),
})

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'])
const START_WORDS = new Set(['START', 'UNSTOP'])

function authorized(request: Request): boolean {
  const expected = process.env.SMS_CONSENT_WEBHOOK_SECRET
  const received = request.headers.get('x-sms-consent-secret')
  if (!expected || !received) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

function consentCommand(body: string | null | undefined, optOutType: string | null | undefined) {
  const providerType = (optOutType || '').trim().toUpperCase()
  if (providerType === 'STOP') return 'stop' as const
  if (providerType === 'START') return 'start' as const

  const keyword = (body || '').trim().toUpperCase().split(/\s+/)[0] || ''
  if (STOP_WORDS.has(keyword)) return 'stop' as const
  if (START_WORDS.has(keyword)) return 'start' as const
  return null
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()
  if (!db) {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 })
  }

  try {
    const input = requestSchema.parse(await request.json())
    const phone = normalizePhone(input.phone)
    if (!phone) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 })
    }

    const command = consentCommand(input.body, input.optOutType)
    if (!command) {
      return NextResponse.json({ processed: false, reason: 'Not an SMS consent keyword' })
    }

    const now = new Date().toISOString()
    const optedOut = command === 'stop'
    const keyword = (input.optOutType || input.body || command).trim().toUpperCase().slice(0, 40)
    const { error: suppressionError } = await db.from('sms_suppressions').upsert(
      {
        phone,
        opted_out: optedOut,
        source: input.source,
        last_keyword: keyword,
        opted_out_at: optedOut ? now : null,
        opted_in_at: optedOut ? null : now,
        updated_at: now,
      },
      { onConflict: 'phone' },
    )
    if (suppressionError) throw suppressionError

    const { error: contactError } = await db
      .from('contacts')
      .update({ ok_to_contact: !optedOut })
      .eq('phone', phone)
    if (contactError) throw contactError

    return NextResponse.json({
      processed: true,
      phone,
      smsConsent: optedOut ? 'opted_out' : 'opted_in',
      updatedAt: now,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: error.issues }, { status: 400 })
    }
    console.error('[twilio-consent]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Consent update failed' },
      { status: 500 },
    )
  }
}
