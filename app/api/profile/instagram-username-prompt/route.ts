import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { toInstagramUrl } from '@/lib/instagramUsername'

type Body = {
  action?: string
  username?: string
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!supabase || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as Body
    const action = typeof body.action === 'string' ? body.action : ''
    const nowIso = new Date().toISOString()

    if (action === 'save') {
      const url = toInstagramUrl(body.username)
      if (!url) {
        return NextResponse.json({ error: 'Enter a valid Instagram username' }, { status: 400 })
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          instagram_link: url,
          instagram_prompt_snoozed_until: null,
          instagram_no_account: false,
          updated_at: nowIso,
        })
        .eq('id', user.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    if (action === 'snooze') {
      const until = new Date()
      until.setDate(until.getDate() + 7)

      const { error } = await supabase
        .from('profiles')
        .update({
          instagram_prompt_snoozed_until: until.toISOString(),
          updated_at: nowIso,
        })
        .eq('id', user.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, snoozedUntil: until.toISOString() })
    }

    if (action === 'no_account') {
      const { error } = await supabase
        .from('profiles')
        .update({
          instagram_no_account: true,
          instagram_prompt_snoozed_until: null,
          updated_at: nowIso,
        })
        .eq('id', user.id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
