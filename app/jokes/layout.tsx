import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Jokes — One Mic Stand',
  description:
    'Read one-liners from comics and fans. Performers and audience members can both post after signing in.',
  alternates: { canonical: '/jokes' },
}

export default function JokesLayout({ children }: { children: React.ReactNode }) {
  return children
}
