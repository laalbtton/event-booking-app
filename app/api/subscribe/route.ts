import { NextRequest, NextResponse } from 'next/server'
import { subscribeEmailUpdates } from '@/lib/server/emailSubscribe'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const result = await subscribeEmailUpdates({
      firstName: body?.firstName,
      email: body?.email,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      alreadySubscribed: result.alreadySubscribed,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not subscribe'
    console.error('[subscribe]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
