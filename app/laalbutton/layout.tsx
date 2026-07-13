import type { Metadata } from 'next'
import { LBHeader } from '@/components/laalbutton/LBHeader'
import { LBFooter } from '@/components/laalbutton/LBFooter'

export const metadata: Metadata = {
  title: {
    default: 'Laal Button Comedy — Toronto South Asian Comedy',
    template: '%s | Laal Button Comedy',
  },
  description:
    'Laal Button is Toronto\'s South Asian comedy community — open mics, showcases, and spaces where South Asian stories live on stage.',
  openGraph: {
    siteName: 'Laal Button Comedy',
    url: 'https://laalbutton.com',
    type: 'website',
  },
}

export default function LaalButtonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative min-h-screen"
      style={{
        background: '#0d0a07',
        color: '#e8d9c4',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Grain texture — sits behind content so text stays sharp */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat',
          backgroundSize: '200px 200px',
          opacity: 0.025,
        }}
      />

      <div className="relative z-10">
        <LBHeader />
        <main>{children}</main>
        <LBFooter />
      </div>
    </div>
  )
}
