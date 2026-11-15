import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { processFacebookLead } from '@/lib/server/processFacebookLead'

export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const expected = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET
  const received = request.headers.get('x-lead-webhook-secret')
  if (!expected || !received) return false
  const a = Buffer.from(expected)
  const b = Buffer.from(received)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    return NextResponse.json(await processFacebookLead(await request.json()))
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid lead', details: error.issues }, { status: 400 })
    }
    console.error('[facebook-leads]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Lead processing failed' },
      { status: 500 },
    )
  }
}
