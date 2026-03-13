import { NextRequest, NextResponse } from 'next/server'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function lookupSlug(eventId: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) return null

  const url = `${supabaseUrl}/rest/v1/events?id=eq.${encodeURIComponent(eventId)}&select=slug`
  const response = await fetch(url, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    cache: 'no-store',
  }).catch(() => null)

  if (!response?.ok) return null
  const rows = (await response.json().catch(() => [])) as Array<{ slug?: string | null }>
  const slug = rows?.[0]?.slug
  return slug || null
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'events' || parts.length !== 2) return NextResponse.next()

  const identifier = parts[1]
  if (!UUID_RE.test(identifier)) return NextResponse.next()

  const slug = await lookupSlug(identifier)
  if (!slug) return NextResponse.next()

  const target = new URL(`/events/${slug}`, request.url)
  return NextResponse.redirect(target, 301)
}

export const config = {
  matcher: ['/events/:path*'],
}
