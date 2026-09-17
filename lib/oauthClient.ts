import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

export type OAuthProvider = 'google' | 'apple'

const NATIVE_OAUTH_REDIRECT = 'com.laalbutton.app://auth/callback'

export function getOAuthDisplayName(user: { user_metadata?: Record<string, unknown> }): string | null {
  const meta = user.user_metadata || {}
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : ''
  if (fullName) return fullName

  const name = typeof meta.name === 'string' ? meta.name.trim() : ''
  if (name) return name

  const given = typeof meta.given_name === 'string' ? meta.given_name.trim() : ''
  const family = typeof meta.family_name === 'string' ? meta.family_name.trim() : ''
  const combined = `${given} ${family}`.trim()
  return combined || null
}

export function getOAuthAvatarUrl(user: { user_metadata?: Record<string, unknown> }): string | null {
  const meta = user.user_metadata || {}
  const avatar = meta.avatar_url || meta.picture
  return typeof avatar === 'string' && avatar.trim() ? avatar.trim() : null
}

/** Copy name/avatar from the OAuth provider onto the profile if those fields are still empty. */
export async function persistOAuthProfileFields(user: User) {
  const avatar = getOAuthAvatarUrl(user)
  const fullName = getOAuthDisplayName(user)
  if (!avatar && !fullName) return

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile) return

  const patch: { avatar_url?: string; full_name?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  }
  if (!profile.avatar_url && avatar) patch.avatar_url = avatar
  if (!profile.full_name && fullName) patch.full_name = fullName
  if (!patch.avatar_url && !patch.full_name) return

  await supabase.from('profiles').update(patch).eq('id', user.id)
}

/**
 * Start Google or Apple OAuth.
 * Native Capacitor uses a Custom Tab + custom URL scheme so the user stays in-app.
 * Web uses the standard redirect to /auth/callback.
 */
export async function startOAuthSignIn(
  provider: OAuthProvider,
  options?: { pendingRoleOnboarding?: boolean }
): Promise<{ native: boolean }> {
  if (options?.pendingRoleOnboarding && typeof window !== 'undefined') {
    window.localStorage.setItem('pending_role_onboarding', '1')
  }

  let isNative = false
  try {
    const { Capacitor } = await import('@capacitor/core')
    isNative = Capacitor.isNativePlatform()
  } catch {
    /* web */
  }

  const appleScopes = provider === 'apple' ? { scopes: 'name email' } : {}

  if (isNative) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: NATIVE_OAUTH_REDIRECT,
        skipBrowserRedirect: true,
        ...appleScopes,
      },
    })
    if (error) throw error
    if (data.url) {
      const { Browser } = await import('@capacitor/browser')
      await Browser.open({ url: data.url })
    }
    return { native: true }
  }

  const redirectUrl = `${window.location.origin}/auth/callback`
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: redirectUrl,
      ...appleScopes,
    },
  })
  if (error) throw error
  return { native: false }
}
