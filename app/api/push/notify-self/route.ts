import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { sendPushToUser } from '@/lib/server/push'

type NotifyType = 'waitlist_promoted' | 'event_reminder' | 'booking_update'

const templates: Record<NotifyType, { title: string; body: string }> = {
  waitlist_promoted: {
    title: 'Promoted to confirmed spot',
    body: 'A waitlist spot opened up and your booking is now confirmed.',
  },
  event_reminder: {
    title: 'Event reminder',
    body: 'Your booked event is coming up soon.',
  },
  booking_update: {
    title: 'Booking update',
    body: 'There is an update on one of your bookings.',
  },
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const type = body?.type as NotifyType | undefined
    if (!type || !templates[type]) {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    }

    const title = typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : templates[type].title
    const message = typeof body?.body === 'string' && body.body.trim() ? body.body.trim() : templates[type].body
    const url = typeof body?.url === 'string' && body.url.trim() ? body.url.trim() : '/dashboard'

    const result = await sendPushToUser(supabase, user.id, {
      title,
      body: message,
      data: { url },
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error: any) {
    console.error('Push notify-self error:', error)
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

