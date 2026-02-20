const GRAPH_VERSION = 'v21.0'

type ExchangeResult = {
  accessToken: string
  expiresAt: string | null
}

export async function exchangeForLongLivedUserToken(shortOrLongToken: string): Promise<ExchangeResult | null> {
  const clientId = process.env.INSTAGRAM_CLIENT_ID
  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  const exchangeUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`)
  exchangeUrl.searchParams.set('grant_type', 'fb_exchange_token')
  exchangeUrl.searchParams.set('client_id', clientId)
  exchangeUrl.searchParams.set('client_secret', clientSecret)
  exchangeUrl.searchParams.set('fb_exchange_token', shortOrLongToken)

  const response = await fetch(exchangeUrl.toString(), { cache: 'no-store' })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result?.access_token) return null

  const expiresIn = Number(result.expires_in || 0)
  return {
    accessToken: result.access_token,
    expiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  }
}

export async function resolveInstagramPageToken(userToken: string) {
  const pagesUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`)
  pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account')
  pagesUrl.searchParams.set('access_token', userToken)

  const pagesResponse = await fetch(pagesUrl.toString(), { cache: 'no-store' })
  const pagesResult = await pagesResponse.json().catch(() => ({}))
  const pages = Array.isArray(pagesResult?.data) ? pagesResult.data : []
  const pageWithInstagram = pages.find((page: any) => page?.instagram_business_account?.id && page?.access_token)

  if (!pageWithInstagram?.instagram_business_account?.id) return null

  const instagramAccountId = pageWithInstagram.instagram_business_account.id as string
  const pageAccessToken = pageWithInstagram.access_token as string

  const igUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${instagramAccountId}`)
  igUrl.searchParams.set('fields', 'id,username')
  igUrl.searchParams.set('access_token', pageAccessToken)
  const igResponse = await fetch(igUrl.toString(), { cache: 'no-store' })
  const igProfile = await igResponse.json().catch(() => ({}))

  return {
    instagramAccountId,
    pageAccessToken,
    username: igProfile?.username || null,
    pageId: pageWithInstagram.id || null,
    pageName: pageWithInstagram.name || null,
  }
}
