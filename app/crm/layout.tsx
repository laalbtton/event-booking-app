import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'CRM — Laal Button',
  description: 'Your private list of people to invite to shows.',
  robots: { index: false, follow: false },
}

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children
}
