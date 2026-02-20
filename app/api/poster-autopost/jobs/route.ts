import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const eventId = request.nextUrl.searchParams.get('eventId')
    const mineOnly = request.nextUrl.searchParams.get('mine') !== 'false'

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const { data: adminLink } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    const isAdmin = profile?.role === 'admin' || !!adminLink

    let query = supabase
      .from('social_post_jobs')
      .select('id, user_id, event_id, status, provider, attempt_count, last_error, processed_at, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(100)

    if (eventId) query = query.eq('event_id', eventId)
    if (mineOnly) {
      query = query.eq('user_id', user.id)
    } else if (!isAdmin) {
      const { data: hostEvents } = await supabase
        .from('events')
        .select('id')
        .or(`created_by.eq.${user.id},host_user_id.eq.${user.id}`)

      const hostIds = (hostEvents || []).map((row: any) => row.id)
      if (eventId && !hostIds.includes(eventId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (!eventId) {
        if (hostIds.length === 0) return NextResponse.json({ jobs: [], summary: {} })
        query = query.in('event_id', hostIds)
      }
    }

    const { data: jobs, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const summary = (jobs || []).reduce(
      (acc: Record<string, number>, job: any) => {
        acc[job.status] = (acc[job.status] || 0) + 1
        return acc
      },
      {}
    )

    return NextResponse.json({ jobs: jobs || [], summary })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
