import { NextResponse } from 'next/server'
import { sendAppStoresAnnouncementBroadcast } from '@/lib/server/appStoreAnnouncement'
import { getMissingBroadcastConfig } from '@/lib/server/resendAudience'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  if ((data as { role?: string } | null)?.role === 'admin') return true
  const { data: adminFallback } = await supabase.from('admin_users').select('id').eq('user_id', userId).maybeSingle()
  return !!adminFallback
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  const isCronSecret = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`

  if (!isCronSecret) {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const missingConfig = getMissingBroadcastConfig()

  try {
    const result = await sendAppStoresAnnouncementBroadcast()
    return NextResponse.json({
      success: !!result.broadcastId,
      ...result,
      missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[send-app-store-announcement]', error)
    return NextResponse.json(
      {
        error: message,
        missingConfig: missingConfig.length > 0 ? missingConfig : undefined,
      },
      { status: 500 },
    )
  }
}
