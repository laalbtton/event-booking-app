import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

const FLAG_KEY = 'instagram_username_prompt'

/** Public read: whether the app should show the Instagram username prompt (default on if unset). */
export async function GET() {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return NextResponse.json({ enabled: true })
    }

    const { data, error } = await supabase
      .from('system_feature_flags')
      .select('enabled')
      .eq('key', FLAG_KEY)
      .maybeSingle()

    if (error) {
      console.warn('instagram-username-prompt flag read:', error.message)
      return NextResponse.json({ enabled: true })
    }

    const enabled = data ? Boolean((data as { enabled?: boolean }).enabled) : true
    return NextResponse.json({ enabled })
  } catch {
    return NextResponse.json({ enabled: true })
  }
}
