function slugifyPart(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

function extractCityFromLocation(location: string): string {
  const parts = location.split(',').map((part) => part.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2]
  if (parts.length === 1) return parts[0]
  return ''
}

export function buildEventSlugBase(title: string, location: string, dateIso: string): string {
  const date = new Date(dateIso)
  const month = date.toLocaleString('en-US', { month: 'short' }).toLowerCase()
  const year = String(date.getUTCFullYear())
  const city = extractCityFromLocation(location)

  const parts = [slugifyPart(title), slugifyPart(city), month, year].filter(Boolean)
  const base = parts.join('-')
  return base || 'event'
}

export function appendSlugSuffix(base: string, suffix: string): string {
  const cleanSuffix = slugifyPart(suffix).slice(0, 8)
  if (!cleanSuffix) return base
  return `${base}-${cleanSuffix}`
}
