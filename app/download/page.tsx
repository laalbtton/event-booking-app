import type { Metadata } from 'next'
import { PublicHeader } from '@/components/public/PublicHeader'
import { DOWNLOAD_PATH } from '@/lib/appStores'
import { DownloadOptions } from './DownloadOptions'

const PAGE_URL = `https://app.laalbutton.com${DOWNLOAD_PATH}`

export const metadata: Metadata = {
  title: 'Download One Mic Stand',
  description:
    'Get One Mic Stand on the App Store, Google Play, or as a web app. Subscribe for email updates.',
  openGraph: {
    title: 'Download One Mic Stand',
    description: 'App Store, Google Play, or add the web app to your home screen.',
    url: PAGE_URL,
    siteName: 'One Mic Stand',
    type: 'website',
  },
}

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-stone-100">
      <PublicHeader />
      <main className="mx-auto max-w-md px-4 py-12 sm:py-16">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-yellow-400">
          One Mic Stand
        </p>
        <h1 className="mt-2 text-center text-3xl font-extrabold tracking-tight text-white">
          Get the app
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-center text-sm text-stone-400">
          Pick the App Store, Google Play, or install the web app. Same account on every option.
        </p>
        <p className="mt-2 text-center text-xs text-stone-500">app.laalbutton.com/download</p>
        <div className="mt-8">
          <DownloadOptions />
        </div>
      </main>
    </div>
  )
}
