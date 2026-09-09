/**
 * Client helper: join all public active communities when the user has none.
 * Failures are swallowed so callers can treat this as a non-blocking fallback.
 */
export async function ensureDefaultCommunities(
  accessToken: string | null | undefined,
): Promise<{ joined: number; communityIds: string[] }> {
  if (!accessToken) return { joined: 0, communityIds: [] }

  try {
    const res = await fetch('/api/communities/ensure-default', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return { joined: 0, communityIds: [] }

    const data = (await res.json()) as {
      joined?: number
      communityIds?: string[]
    }
    return {
      joined: typeof data.joined === 'number' ? data.joined : 0,
      communityIds: Array.isArray(data.communityIds) ? data.communityIds : [],
    }
  } catch {
    return { joined: 0, communityIds: [] }
  }
}
