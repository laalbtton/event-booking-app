import { NextRequest, NextResponse } from 'next/server'
import { getUserFromAuthHeader } from '@/lib/server/supabaseAdmin'

const INSTAGRAM_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
]

function getRedirectUri(request: NextRequest) {
  return (
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${request.nextUrl.origin}/api/social/instagram/callback`
  )
}

export async function GET(request: NextRequest) {
  try {
    const { user } = await getUserFromAuthHeader(request.headers.get('authorization'))
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const clientId = process.env.INSTAGRAM_CLIENT_ID
    const configId = process.env.INSTAGRAM_LOGIN_CONFIG_ID
    if (!clientId) {
      return NextResponse.json({ error: 'Missing INSTAGRAM_CLIENT_ID' }, { status: 500 })
    }

    const redirectPath = request.nextUrl.searchParams.get('redirect') || '/profile'
    const state = Buffer.from(
      JSON.stringify({
        userId: user.id,
        redirect: redirectPath,
        t: Date.now(),
      })
    ).toString('base64url')

    const connectUrl = new URL('https://www.facebook.com/v21.0/dialog/oauth')
    connectUrl.searchParams.set('client_id', clientId)
    connectUrl.searchParams.set('redirect_uri', getRedirectUri(request))
    connectUrl.searchParams.set('response_type', 'code')
    // Facebook Login for Business expects config_id-based OAuth.
    // Keep scope fallback for environments still using classic OAuth settings.
    if (configId) {
      connectUrl.searchParams.set('config_id', configId)
    } else {
      connectUrl.searchParams.set('scope', INSTAGRAM_SCOPES.join(','))
    }
    connectUrl.searchParams.set('state', state)

    return NextResponse.json({ connectUrl: connectUrl.toString() })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
