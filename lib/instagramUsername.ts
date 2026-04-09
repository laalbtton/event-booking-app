/** Normalize stored or typed Instagram value to bare username (no @). */
export function extractInstagramUsername(value: string | null | undefined): string {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  const cleaned = trimmed.replace(/^@+/, '')
  if (!cleaned.includes('/')) return cleaned
  const match = cleaned.match(/instagram\.com\/([^/?#]+)/i)
  if (match?.[1]) return match[1].replace(/^@+/, '')
  const parts = cleaned.split('/').filter(Boolean)
  return (parts[parts.length - 1] || '').replace(/^@+/, '')
}

export function toInstagramUrl(usernameOrUrl: string | null | undefined): string | null {
  const username = extractInstagramUsername(usernameOrUrl)
  if (!username) return null
  return `https://instagram.com/${username}`
}

export function profileHasInstagramUsername(instagramLink: string | null | undefined): boolean {
  return extractInstagramUsername(instagramLink).length > 0
}
