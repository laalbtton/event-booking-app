import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Feed — One Mic Stand',
  description:
    'See upcoming comedy shows, open mics, and recent jokes from the community. Search performers by name — no account needed to browse.',
  alternates: { canonical: '/feed' },
}

export default function FeedLayout({ children }: { children: React.ReactNode }) {
  return children
}
