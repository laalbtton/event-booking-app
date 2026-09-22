import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Find Performers — One Mic Stand',
  description:
    'Search comics and performers by name. Follow them to see upcoming gigs in your feed.',
  alternates: { canonical: '/performers' },
}

export default function PerformersLayout({ children }: { children: React.ReactNode }) {
  return children
}
