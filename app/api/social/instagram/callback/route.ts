import { NextRequest, NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { exchangeForLongLivedUserToken, resolveInstagramPageToken } from '@/lib/server/instagramAuth'

function decodeState(encoded: string | null): { userId: string; redirect?: string } | null {
  if (!encoded) return null
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8')
    const parsed = JSON.parse(json)
    if (!parsed?.userId) return null
    return parsed
  } catch {
    return null
  }
}

function callbackRedirect(request: NextRequest, path: string, status: string) {
  const url = new URL(path, request.nextUrl.origin)
  url.searchParams.set('instagram', status)
  return NextResponse.redirect(url)
}

function getRedirectUri(request: NextRequest) {
  return (
    process.env.INSTAGRAM_REDIRECT_URI ||
    `${request.nextUrl.origin}/api/social/instagram/callback`
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminClient()
    if (!supabase) {
      return callbackRedirect(request, '/profile', 'error_env')
    }

    const code = request.nextUrl.searchParams.get('code')
    const state = decodeState(request.nextUrl.searchParams.get('state'))
    const errorReason = request.nextUrl.searchParams.get('error_reason')

    const redirectTarget = state?.redirect || '/profile'

    if (errorReason) {
      return callbackRedirect(request, redirectTarget, 'denied')
    }
    if (!state?.userId || !code) {
      return callbackRedirect(request, redirectTarget, 'invalid_callback')
    }

    const clientId = process.env.INSTAGRAM_CLIENT_ID
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET
    if (!clientId || !clientSecret) {
      return callbackRedirect(request, redirectTarget, 'error_env')
    }

    const tokenUrl = new URL('https://graph.facebook.com/v21.0/oauth/access_token')
    tokenUrl.searchParams.set('client_id', clientId)
    tokenUrl.searchParams.set('client_secret', clientSecret)
    tokenUrl.searchParams.set('redirect_uri', getRedirectUri(request))
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl.toString(), { cache: 'no-store' })
    const tokenResult = await tokenResponse.json().catch(() => ({}))

    if (!tokenResult?.access_token) {
      return callbackRedirect(request, redirectTarget, 'token_exchange_failed')
    }

    const shortLivedUserToken = tokenResult.access_token as string
    const longLived = await exchangeForLongLivedUserToken(shortLivedUserToken)
    const userToken = longLived?.accessToken || shortLivedUserToken
    const expiresAt = longLived?.expiresAt || null

    const resolved = await resolveInstagramPageToken(userToken)
    if (!resolved?.instagramAccountId || !resolved?.pageAccessToken) {
      return callbackRedirect(request, redirectTarget, 'missing_instagram_business_account')
    }

    const { error: upsertError } = await supabase
      .from('social_accounts')
      .upsert(
        {
          user_id: state.userId,
          provider: 'instagram',
          external_account_id: resolved.instagramAccountId,
          account_username: resolved.username,
          access_token: resolved.pageAccessToken,
          refresh_token: userToken,
          expires_at: expiresAt,
          is_active: true,
          metadata: {
            page_id: resolved.pageId,
            page_name: resolved.pageName,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,provider,external_account_id' }
      )

    if (upsertError) {
      return callbackRedirect(request, redirectTarget, 'save_failed')
    }

    await supabase
      .from('notifications')
      .insert({
        user_id: state.userId,
        type: 'general',
        title: 'Instagram connected',
        message: 'Your Instagram account is now connected for event poster auto-posting.',
      })

    return callbackRedirect(request, redirectTarget, 'connected')
  } catch (error) {
    console.error('Instagram callback error:', error)
    return callbackRedirect(request, '/profile', 'error')
  }
}
