import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl().replace(/\/$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard', '/admin', '/settings', '/notifications', '/credits', '/bookings', '/venues/redemptions'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
