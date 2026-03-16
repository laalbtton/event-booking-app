const PENDING_COMMUNITY_INVITE_KEY = 'pending_community_invite_token'

export function setPendingCommunityInviteToken(token: string) {
  if (typeof window === 'undefined') return
  const value = token.trim()
  if (!value) return
  window.localStorage.setItem(PENDING_COMMUNITY_INVITE_KEY, value)
}

export function getPendingCommunityInviteToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(PENDING_COMMUNITY_INVITE_KEY)
}

export function clearPendingCommunityInviteToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PENDING_COMMUNITY_INVITE_KEY)
}

type RedeemResult = {
  success: boolean
  communityId?: string
  communityName?: string
  role?: string
  error?: string
}

export async function redeemPendingCommunityInvite(accessToken: string): Promise<RedeemResult | null> {
  const token = getPendingCommunityInviteToken()
  if (!token) return null

  try {
    const response = await fetch('/api/community-invite-links/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token }),
    })
    const result = (await response.json().catch(() => ({}))) as RedeemResult

    if (response.ok && result.success) {
      clearPendingCommunityInviteToken()
    }

    return result
  } catch {
    return null
  }
}
