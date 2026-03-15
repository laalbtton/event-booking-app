import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function isSuperAdmin(supabase: any, userId: string): Promise<boolean> {
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).single()
  if ((profile as { role?: string } | null)?.role === 'admin') return true
  const { data: adminUser } = await supabase.from('admin_users').select('user_id').eq('user_id', userId).single()
  return Boolean(adminUser)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!(await isSuperAdmin(supabase, authData.user.id))) {
      return NextResponse.json({ error: 'Super admin access required' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const { requestId, action, adminNotes } = body

    if (!requestId || !['approved', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'requestId and action (approved|rejected) are required' }, { status: 400 })
    }

    const { data: creationRequest } = await supabase
      .from('community_creation_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (!creationRequest) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

    const req = creationRequest as {
      status: string; user_id: string; name: string; description: string | null
      location: string | null; language: string | null
    }

    if (req.status !== 'pending') {
      return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 400 })
    }

    await supabase
      .from('community_creation_requests')
      .update({
        status: action,
        reviewed_by: authData.user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: adminNotes || null,
      })
      .eq('id', requestId)

    if (action === 'approved') {
      // Create the community
      const { data: newCommunity, error: communityError } = await supabase
        .from('communities')
        .insert({
          name: req.name,
          description: req.description,
          location: req.location,
          language: req.language,
          is_public: true,
          status: 'active',
          created_by: req.user_id,
        })
        .select('id')
        .single()

      if (communityError || !newCommunity) {
        return NextResponse.json({ error: 'Failed to create community' }, { status: 500 })
      }

      const communityId = (newCommunity as { id: string }).id

      // Add the applicant as admin of the new community
      await supabase.from('community_members').insert({
        community_id: communityId,
        user_id: req.user_id,
        role: 'admin',
      })

      await supabase.rpc('create_notification', {
        p_user_id: req.user_id,
        p_type: 'community_creation_request',
        p_title: 'Community Creation Approved',
        p_message: `Your request to create "${req.name}" has been approved! You are now the community admin.`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    } else {
      await supabase.rpc('create_notification', {
        p_user_id: req.user_id,
        p_type: 'community_creation_request',
        p_title: 'Community Creation Request Update',
        p_message: `Your request to create "${req.name}" was not approved at this time.${adminNotes ? ` Note: ${adminNotes}` : ''}`,
        p_related_booking_id: null,
        p_related_event_id: null,
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
