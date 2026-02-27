import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToUser } from '@/lib/server/push'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body?.title === 'string' && body.title.trim().length > 0
      ? body.title.trim()
      : 'Push notifications are enabled'
    const message = typeof body?.body === 'string' && body.body.trim().length > 0
      ? body.body.trim()
      : 'You will now receive important event updates.'
    const url = typeof body?.url === 'string' && body.url.trim().length > 0
      ? body.url.trim()
      : '/dashboard'

    const result = await sendPushToUser(supabase, user.id, {
      title,
      body: message,
      data: { url },
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Push test error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

