import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * PATCH /api/venues/[id]/settings
 *
 * Allows a venue manager (active venue_staff) or platform admin to update
 * a venue's profile fields:
 *   description, google_review_url, website_url,
 *   parking_options, accessibility, food_drinks_available, drinks_available
 *
 * Core structural fields (name, address, city, …) are also accepted so that
 * admins can update them through this route too.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = getAdminClient()
    if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 })

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Missing auth token' }, { status: 401 })

    const { data: authData, error: authError } = await supabase.auth.getUser(token)
    if (authError || !authData.user)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: venueId } = await params

    // Auth: must be admin or active venue_staff for this venue
    const [{ data: profile }, { data: staffRow }] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', authData.user.id).single(),
      supabase
        .from('venue_staff')
        .select('id')
        .eq('venue_id', venueId)
        .eq('user_id', authData.user.id)
        .eq('active', true)
        .maybeSingle(),
    ])

    const isAdmin = (profile as { role?: string } | null)?.role === 'admin'
    const isVenueStaff = !!staffRow

    if (!isAdmin && !isVenueStaff) {
      return NextResponse.json({ error: 'Not authorized to manage this venue' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>

    // Allowed fields — admins can also update structural fields
    const allowed: (keyof typeof body)[] = [
      'description',
      'google_review_url',
      'website_url',
      'parking_options',
      'accessibility',
      'food_drinks_available',
      'drinks_available',
    ]
    if (isAdmin) {
      allowed.push('name', 'address', 'city', 'region', 'postal_code', 'country')
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    for (const key of allowed) {
      if (key in body) patch[key] = body[key]
    }

    const { error: updateError } = await supabase
      .from('venues')
      .update(patch)
      .eq('id', venueId)

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
