'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { UserCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

type FollowButtonProps = {
  targetUserId: string
  targetName?: string
  /** 'dark' matches the public profile's zinc/yellow theme; 'app' matches in-app surfaces. */
  theme?: 'dark' | 'app'
  /**
   * Known follow state, for lists whose data source already resolved it. Supplying
   * it skips the per-button status request, so a page of results costs one call
   * instead of one per row.
   */
  initialFollowing?: boolean
  className?: string
}

/**
 * Follow / Following toggle. Deliberately shows no follower count — following
 * is a way to stay connected, not a public scoreboard.
 */
export default function FollowButton({
  targetUserId,
  targetName,
  theme = 'dark',
  initialFollowing,
  className = '',
}: FollowButtonProps) {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing ?? false)
  const [loading, setLoading] = useState(initialFollowing === undefined)
  const [saving, setSaving] = useState(false)

  const isSelf = !!user && user.id === targetUserId

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, [])

  useEffect(() => {
    if (!authResolved) return
    if (!user || isSelf || initialFollowing !== undefined) {
      setLoading(false)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        const token = await getToken()
        if (!token) return
        const res = await fetch(`/api/follows?userId=${encodeURIComponent(targetUserId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const json = await res.json()
        if (!cancelled) setFollowing(json.following === true)
      } catch {
        // Non-fatal — button just renders as "Follow"
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [authResolved, user, isSelf, targetUserId, getToken, initialFollowing])

  if (isSelf) return null
  if (authResolved && !user) {
    return (
      <button
        type="button"
        onClick={() => router.push('/login')}
        className={buttonClass(theme, false, className)}
      >
        <UserPlus className="h-4 w-4" />
        Follow
      </button>
    )
  }

  async function toggleFollow() {
    if (saving) return
    setSaving(true)
    const next = !following
    setFollowing(next)

    try {
      const token = await getToken()
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/follows', {
        method: next ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ userId: targetUserId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Request failed')

      toast.success(
        next
          ? `Following${targetName ? ` ${targetName}` : ''} — their gigs will show in your feed`
          : `Unfollowed${targetName ? ` ${targetName}` : ''}`,
      )
    } catch (err: unknown) {
      setFollowing(!next)
      toast.error(err instanceof Error ? err.message : 'Could not update follow')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      onClick={() => void toggleFollow()}
      disabled={loading || saving}
      aria-pressed={following}
      className={buttonClass(theme, following, className)}
    >
      {following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {following ? 'Following' : 'Follow'}
    </button>
  )
}

function buttonClass(theme: 'dark' | 'app', following: boolean, extra: string): string {
  const base =
    'inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed'

  if (theme === 'dark') {
    return `${base} ${
      following
        ? 'border border-zinc-700 bg-zinc-800 text-stone-300 hover:border-red-400/60 hover:text-red-300'
        : 'bg-yellow-400 text-zinc-950 hover:bg-yellow-300'
    } ${extra}`
  }

  return `${base} ${
    following
      ? 'border border-border bg-muted text-foreground hover:bg-muted/70'
      : 'bg-primary text-primary-foreground hover:bg-primary/90'
  } ${extra}`
}
