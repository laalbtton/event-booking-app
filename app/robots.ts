import type { MetadataRoute } from 'next'
import { getSiteUrl } from '@/lib/seo/metadata'

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl().replace(/\/$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/login',
          '/signup',
          '/dashboard',
          '/dashboard/',
          '/admin',
          '/admin/',
          '/settings',
          '/settings/',
          '/profile/edit',
          '/notifications',
          '/credits',
          '/bookings',
          '/bookings/',
          '/venues/redemptions',
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
