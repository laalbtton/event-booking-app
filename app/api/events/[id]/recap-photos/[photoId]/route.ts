import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'
import { RECAP_BUCKET } from '@/lib/recapPhotos'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  try {
    const { supabase, user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId, photoId } = await params
    const { data: photo } = await supabase
      .from('event_recap_photos')
      .select('id, event_id, uploaded_by, storage_path, status')
      .eq('id', photoId)
      .eq('event_id', eventId)
      .maybeSingle()

    if (!photo) return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
    if (photo.status === 'posting') {
      return NextResponse.json({ error: 'This photo is already being posted' }, { status: 409 })
    }

    const [{ data: event }, { data: profile }, { data: adminLink }] = await Promise.all([
      supabase.from('events').select('created_by, host_user_id').eq('id', eventId).maybeSingle(),
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle(),
    ])

    const canDelete =
      photo.uploaded_by === user.id ||
      event?.created_by === user.id ||
      event?.host_user_id === user.id ||
      profile?.role === 'admin' ||
      !!adminLink

    if (!canDelete) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (photo.storage_path) {
      await supabase.storage.from(RECAP_BUCKET).remove([photo.storage_path])
    }

    const { error } = await supabase.from('event_recap_photos').delete().eq('id', photoId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
