import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { error } = await supabase
      .from('social_accounts')
      .delete()
      .eq('user_id', user.id)
      .eq('provider', 'instagram')

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('notifications').insert({
      user_id: user.id,
      type: 'general',
      title: 'Instagram disconnected',
      message: 'Poster auto-posting has been turned off because Instagram was disconnected.',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
