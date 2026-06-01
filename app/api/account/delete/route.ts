import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

/**
 * Permanently deletes the authenticated user's account (auth + cascaded profile data).
 */
export async function POST(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!supabase) {
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) {
      console.error('[account/delete]', error)
      return NextResponse.json({ error: 'Could not delete account' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('[account/delete]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
