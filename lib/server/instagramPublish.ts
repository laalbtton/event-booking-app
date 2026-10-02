import { exchangeForLongLivedUserToken, resolveInstagramPageToken } from '@/lib/server/instagramAuth'
import { getAdminClient } from '@/lib/server/supabaseAdmin'

const GRAPH_VERSION = 'v21.0'
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`

type AdminClient = NonNullable<ReturnType<typeof getAdminClient>>

export type InstagramAccount = {
  accountId: string
  igAccountId: string
  pageAccessToken: string
}

function graphUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${GRAPH}${path}`)
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return url.toString()
}

async function graphPost(path: string, params: Record<string, string>) {
  const response = await fetch(graphUrl(path, params), { method: 'POST', cache: 'no-store' })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error?.message || `Instagram API error (${response.status})`)
  }
  return result
}

async function graphGet(path: string, params: Record<string, string>) {
  const response = await fetch(graphUrl(path, params), { cache: 'no-store' })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(result?.error?.message || `Instagram API error (${response.status})`)
  }
  return result
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitUntilFinished(creationId: string, accessToken: string) {
  for (let i = 0; i < 20; i += 1) {
    const status = await graphGet(`/${creationId}`, {
      fields: 'status_code',
      access_token: accessToken,
    })
    const code = String(status?.status_code || '')
    if (code === 'FINISHED') return
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new Error(`Instagram media container ${code.toLowerCase()}`)
    }
    await sleep(2000)
  }
  throw new Error('Instagram media container timed out')
}

export async function loadInstagramAccountForUser(
  supabase: AdminClient,
  userId: string
): Promise<InstagramAccount | null> {
  const { data: account } = await supabase
    .from('social_accounts')
    .select('id, external_account_id, access_token, refresh_token, expires_at, is_active')
    .eq('user_id', userId)
    .eq('provider', 'instagram')
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!account?.external_account_id || !account?.access_token) return null

  let igAccountId = account.external_account_id as string
  let pageAccessToken = account.access_token as string
  const expiresAtMs = account.expires_at ? new Date(account.expires_at).getTime() : null
  const needsRefresh = !!(expiresAtMs && expiresAtMs <= Date.now() + 5 * 60 * 1000)

  if (needsRefresh && account.refresh_token) {
    const refreshed = await exchangeForLongLivedUserToken(account.refresh_token)
    if (!refreshed?.accessToken) {
      throw new Error('Instagram token expired and refresh failed')
    }
    const resolved = await resolveInstagramPageToken(refreshed.accessToken)
    if (!resolved?.instagramAccountId || !resolved?.pageAccessToken) {
      throw new Error('Instagram token refresh resolved no business account')
    }
    igAccountId = resolved.instagramAccountId
    pageAccessToken = resolved.pageAccessToken
    await supabase
      .from('social_accounts')
      .update({
        external_account_id: resolved.instagramAccountId,
        account_username: resolved.username,
        access_token: resolved.pageAccessToken,
        refresh_token: refreshed.accessToken,
        expires_at: refreshed.expiresAt,
        metadata: {
          page_id: resolved.pageId,
          page_name: resolved.pageName,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', account.id)
  }

  return { accountId: account.id as string, igAccountId, pageAccessToken }
}

export async function publishInstagramImage(
  igAccountId: string,
  accessToken: string,
  imageUrl: string,
  caption: string | null
) {
  const mediaResult = await graphPost(`/${igAccountId}/media`, {
    image_url: imageUrl,
    access_token: accessToken,
    ...(caption ? { caption } : {}),
  })
  if (!mediaResult?.id) throw new Error('Failed to create Instagram media container')
  await waitUntilFinished(mediaResult.id, accessToken)

  const publishResult = await graphPost(`/${igAccountId}/media_publish`, {
    creation_id: mediaResult.id,
    access_token: accessToken,
  })
  if (!publishResult?.id) throw new Error('Failed to publish Instagram media')
  return publishResult
}

export async function publishInstagramCarousel(
  igAccountId: string,
  accessToken: string,
  imageUrls: string[],
  caption: string | null
) {
  if (imageUrls.length < 2) {
    return publishInstagramImage(igAccountId, accessToken, imageUrls[0], caption)
  }

  const childIds: string[] = []
  for (const imageUrl of imageUrls.slice(0, 10)) {
    const child = await graphPost(`/${igAccountId}/media`, {
      image_url: imageUrl,
      is_carousel_item: 'true',
      access_token: accessToken,
    })
    if (!child?.id) throw new Error('Failed to create Instagram carousel item')
    await waitUntilFinished(child.id, accessToken)
    childIds.push(child.id)
  }

  const carousel = await graphPost(`/${igAccountId}/media`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    access_token: accessToken,
    ...(caption ? { caption } : {}),
  })
  if (!carousel?.id) throw new Error('Failed to create Instagram carousel')
  await waitUntilFinished(carousel.id, accessToken)

  const publishResult = await graphPost(`/${igAccountId}/media_publish`, {
    creation_id: carousel.id,
    access_token: accessToken,
  })
  if (!publishResult?.id) throw new Error('Failed to publish Instagram carousel')
  return publishResult
}
