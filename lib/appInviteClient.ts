const PENDING_APP_INVITE_TOKEN_KEY = 'pending_app_invite_token'

export function setPendingAppInviteToken(token: string) {
  if (typeof window === 'undefined') return
  const value = token.trim()
  if (!value) return
  window.localStorage.setItem(PENDING_APP_INVITE_TOKEN_KEY, value)
}

export function getPendingAppInviteToken() {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(PENDING_APP_INVITE_TOKEN_KEY)
}

export function clearPendingAppInviteToken() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PENDING_APP_INVITE_TOKEN_KEY)
}

type RedeemInviteResult = {
  success: boolean
  granted?: boolean
  alreadyGranted?: boolean
  creditsGranted?: number
  newBalance?: number
  error?: string
}

export async function redeemPendingAppInvite(accessToken: string): Promise<RedeemInviteResult | null> {
  const inviteToken = getPendingAppInviteToken()
  if (!inviteToken) return null

  try {
    const response = await fetch('/api/app-invites/redeem', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ inviteToken }),
    })
    const result = (await response.json().catch(() => ({}))) as RedeemInviteResult

    if (response.ok && result.success) {
      clearPendingAppInviteToken()
    }

    return result
  } catch {
    return null
  }
}
