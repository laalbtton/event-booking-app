import { headers } from 'next/headers'

export type GeoResult = {
  city: string | null
  region: string | null
  country: string | null
}

async function getClientIp(): Promise<string | null> {
  try {
    const headersList = await headers()
    const forwarded = headersList.get('x-forwarded-for')
    if (forwarded) {
      const first = forwarded.split(',')[0].trim()
      if (first && first !== '::1' && first !== '127.0.0.1') return first
    }
    const realIp = headersList.get('x-real-ip')
    if (realIp && realIp !== '::1' && realIp !== '127.0.0.1') return realIp
  } catch {
    // headers() may throw outside of request scope
  }
  return null
}

export async function getVisitorGeo(): Promise<GeoResult> {
  const ip = await getClientIp()
  if (!ip) return { city: null, region: null, country: null }

  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'one-mic-stand/1.0' },
    })
    if (!res.ok) return { city: null, region: null, country: null }
    const json = (await res.json()) as {
      city?: string
      region?: string
      country_name?: string
      error?: boolean
    }
    if (json.error) return { city: null, region: null, country: null }
    return {
      city: json.city || null,
      region: json.region || null,
      country: json.country_name || null,
    }
  } catch {
    return { city: null, region: null, country: null }
  }
}
