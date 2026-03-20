import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@supabase/supabase-js'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify token with Supabase (anon key is sufficient — we just need a valid user)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    )
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: eventId } = await params
    const body = await request.json().catch(() => ({}))
    const slug: string | undefined = body.slug

    // Invalidate the public events listing and this event's detail page
    revalidatePath('/events')
    if (slug) revalidatePath(`/events/${slug}`)
    revalidatePath(`/events/${eventId}`)

    return NextResponse.json({ revalidated: true })
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
