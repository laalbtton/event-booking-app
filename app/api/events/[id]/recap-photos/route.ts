import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient, getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { MAX_RECAP_PHOTOS_PER_POST, recapPostReadyAt } from '@/lib/recapPhotos'
import { sanitizePosterCaption } from '@/lib/posterCaption'

const PHOTO_SELECT = 'id, event_id, uploaded_by, storage_path, public_url, sort_order, status, created_at'

async function canContribute(
  supabase: NonNullable<ReturnType<typeof getAdminClient>>,
  eventId: string,
  userId: string
) {
  const [{ data: event }, { data: profile }, { data: adminLink }, { data: booking }] = await Promise.all([
    supabase.from('events').select('id, created_by, host_user_id, date, end_time, recap_caption, title, location').eq('id', eventId).maybeSingle(),
    supabase.from('profiles').select('role').eq('id', userId).maybeSingle(),
    supabase.from('admin_users').select('user_id').eq('user_id', userId).maybeSingle(),
    supabase
      .from('bookings')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', userId)
      .eq('status', 'confirmed')
      .maybeSingle(),
  ])

  if (!event) return { ok: false as const, status: 404, error: 'Event not found' }

  const isHost = event.created_by === userId || event.host_user_id === userId
  const isAdmin = profile?.role === 'admin' || !!adminLink
  const isConfirmed = !!booking
  if (!isHost && !isAdmin && !isConfirmed) {
    return { ok: false as const, status: 403, error: 'Forbidden' }
  }

  return { ok: true as const, event, isHost, isAdmin }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: eventId } = await params

    const access = await canContribute(supabase, eventId, user.id)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const { data: photos, error } = await supabase
      .from('event_recap_photos')
      .select(PHOTO_SELECT)
      .eq('event_id', eventId)
      .in('status', ['pending', 'posting', 'failed'])
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: igAccount } = await supabase
      .from('social_accounts')
      .select('id')
      .eq('user_id', access.event.host_user_id || access.event.created_by || user.id)
      .eq('provider', 'instagram')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    return NextResponse.json({
      photos: photos || [],
      caption: access.event.recap_caption || '',
      postReadyAt: recapPostReadyAt(access.event.date, access.event.end_time).toISOString(),
      instagramConnected: !!igAccount,
      canManage: access.isHost || access.isAdmin,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: eventId } = await params

    const access = await canContribute(supabase, eventId, user.id)
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const body = await request.json()
    if (typeof body?.caption === 'string' && (access.isHost || access.isAdmin)) {
      const caption = sanitizePosterCaption(body.caption)
      const { error } = await supabase.from('events').update({ recap_caption: caption }).eq('id', eventId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ success: true, caption })
    }

    const photos = Array.isArray(body?.photos) ? body.photos : []
    if (photos.length === 0) {
      return NextResponse.json({ error: 'No photos to save' }, { status: 400 })
    }

    const { count } = await supabase
      .from('event_recap_photos')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .in('status', ['pending', 'posting'])

    const remaining = MAX_RECAP_PHOTOS_PER_POST - (count || 0)
    if (remaining <= 0) {
      return NextResponse.json(
        { error: `You can queue up to ${MAX_RECAP_PHOTOS_PER_POST} photos at a time` },
        { status: 400 }
      )
    }

    const rows = photos.slice(0, remaining).map((photo: { storagePath?: string; publicUrl?: string }, index: number) => {
      if (!photo?.storagePath || !photo?.publicUrl) {
        throw new Error('Each photo needs a storage path and public URL')
      }
      if (!photo.storagePath.startsWith(`${eventId}/`)) {
        throw new Error('Invalid photo path')
      }
      return {
        event_id: eventId,
        uploaded_by: user.id,
        storage_path: photo.storagePath,
        public_url: photo.publicUrl,
        sort_order: (count || 0) + index,
        status: 'pending',
      }
    })

    const { data: inserted, error } = await supabase
      .from('event_recap_photos')
      .insert(rows)
      .select(PHOTO_SELECT)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, photos: inserted || [] })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
