import Link from 'next/link'
import type { Metadata } from 'next'
import { listPublicCommunities } from '@/lib/server/publicCommunities'
import { listPublicVenues } from '@/lib/server/publicVenues'
import { buildCommunityListMetadata } from '@/lib/seo/metadata'
import { PublicHeader } from '@/components/public/PublicHeader'
import { CommunitiesTabs } from './CommunitiesTabs'
import { ChevronLeft } from 'lucide-react'

export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  return buildCommunityListMetadata()
}

export default async function CommunitiesPage() {
  const [communities, venues] = await Promise.all([
    listPublicCommunities(),
    listPublicVenues(),
  ])

  return (
    <>
      <PublicHeader />

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6 space-y-6">
        <div>
          <Link
            href="/settings/communities"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-2"
            aria-label="Back to My Communities"
          >
            <ChevronLeft className="h-4 w-4" />
            My Communities
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Communities & Spaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Join a community or discover the venues hosting live events near you.
          </p>
        </div>

        <CommunitiesTabs communities={communities} venues={venues} />
      </main>
    </>
  )
}
