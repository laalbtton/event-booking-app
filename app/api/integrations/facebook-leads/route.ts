import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { processFacebookLead } from '@/lib/server/processFacebookLead'

export const dynamic = 'force-dynamic'

function authorized(request: Request): boolean {
  const received = request.headers.get('x-lead-webhook-secret')
  if (!received) return false
  const receivedBuffer = Buffer.from(received)
  const acceptedSecrets = [
    process.env.FACEBOOK_LEADS_WEBHOOK_SECRET,
    process.env.HISTORICAL_LEADS_WEBHOOK_SECRET,
  ].filter((secret): secret is string => Boolean(secret))

  return acceptedSecrets.some((secret) => {
    const expectedBuffer = Buffer.from(secret)
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    )
  })
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
