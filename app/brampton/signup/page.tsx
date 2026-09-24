import type { Metadata } from 'next'
import Link from 'next/link'
import { BramptonMicStoolLogo } from '@/components/public/BramptonMicStoolLogo'
import { PublicHeader } from '@/components/public/PublicHeader'
import { BramptonEmailSubscribe } from '../BramptonEmailSubscribe'

export const metadata: Metadata = {
  title: 'Brampton comedy email updates',
  description:
    'Get this week’s Brampton open mics and variety shows in your inbox. No account needed.',
  openGraph: {
    title: 'Brampton comedy email updates',
    description: 'Subscribe for this week’s Brampton open mics and variety shows.',
    url: 'https://app.laalbutton.com/brampton/signup',
    siteName: 'One Mic Stand',
    type: 'website',
  },
}

export default function BramptonEmailSignupPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-stone-100">
      <PublicHeader />
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-8 sm:px-7">
          <BramptonMicStoolLogo className="mb-5" />
          <h1 className="text-center text-3xl font-extrabold tracking-tight text-white">
            Email me the <span className="text-yellow-400">lineup</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-center text-sm text-stone-400">
            This week’s Brampton open mics and variety shows, in your inbox. No account needed.
          </p>
          <p className="mt-2 text-center text-xs text-stone-500">app.laalbutton.com/brampton/signup</p>
          <div className="mt-6">
            <BramptonEmailSubscribe />
          </div>
          <p className="mt-6 text-center text-sm text-stone-500">
            <Link href="/brampton" className="text-yellow-400 hover:text-yellow-300">
              See this week’s shows
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
