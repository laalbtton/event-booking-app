import { getSiteUrl } from '@/lib/seo/metadata'
import { listPublicEvents, listPublicPerformerProfiles } from '@/lib/server/publicContent'

const MAX_URLS_PER_SITEMAP = 50000

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type UrlEntry = {
  loc: string
  lastmod?: string
  changefreq?: 'weekly' | 'monthly'
  priority?: number
}

function renderUrlSet(entries: UrlEntry[]) {
  const body = entries
    .map((entry) => {
      const tags = [
        `<loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `<lastmod>${escapeXml(entry.lastmod)}</lastmod>` : '',
        entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : '',
        typeof entry.priority === 'number' ? `<priority>${entry.priority.toFixed(1)}</priority>` : '',
      ]
        .filter(Boolean)
        .join('')
      return `<url>${tags}</url>`
    })
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}

function renderSitemapIndex(urls: string[]) {
  const body = urls.map((loc) => `<sitemap><loc>${escapeXml(loc)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
}

function buildStaticPages(baseUrl: string): UrlEntry[] {
  return [
    { loc: `${baseUrl}/`, changefreq: 'monthly', priority: 0.8 },
    { loc: `${baseUrl}/contact`, changefreq: 'monthly', priority: 0.8 },
    { loc: `${baseUrl}/events`, changefreq: 'weekly', priority: 0.8 },
  ]
}

export async function GET(request: Request) {
  const siteUrl = getSiteUrl().replace(/\/$/, '')
  const url = new URL(request.url)
  const part = url.searchParams.get('part')

  const [events, performers] = await Promise.all([
    listPublicEvents(60000),
    listPublicPerformerProfiles(60000),
  ])

  const now = Date.now()
  const eventUrls: UrlEntry[] = events.map((event) => {
    const isUpcoming = new Date(event.startDate).getTime() >= now
    return {
      loc: `${siteUrl}/events/${event.slug || event.id}`,
      lastmod: event.updatedAt ? new Date(event.updatedAt).toISOString() : undefined,
      changefreq: 'weekly',
      priority: isUpcoming ? 0.9 : 0.5,
    }
  })

  const performerUrls: UrlEntry[] = performers.map((profile) => ({
    loc: `${siteUrl}/profile/${profile.id}`,
    lastmod: profile.updatedAt ? new Date(profile.updatedAt).toISOString() : undefined,
    changefreq: 'monthly',
    priority: 0.6,
  }))

  const staticUrls = buildStaticPages(siteUrl)
  const allUrls = [...staticUrls, ...eventUrls, ...performerUrls]

  if (allUrls.length <= MAX_URLS_PER_SITEMAP && !part) {
    return new Response(renderUrlSet(allUrls), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const chunks: UrlEntry[][] = []
  for (let i = 0; i < allUrls.length; i += MAX_URLS_PER_SITEMAP) {
    chunks.push(allUrls.slice(i, i + MAX_URLS_PER_SITEMAP))
  }

  if (!part) {
    const indexUrls = chunks.map((_, idx) => `${siteUrl}/sitemap.xml?part=${idx + 1}`)
    return new Response(renderSitemapIndex(indexUrls), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    })
  }

  const index = Math.max(1, Number(part)) - 1
  const selected = chunks[index] || []
  return new Response(renderUrlSet(selected), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  })
}
