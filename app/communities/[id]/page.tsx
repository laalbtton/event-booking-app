import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { getPublicCommunity } from '@/lib/server/publicCommunities'
import { buildCommunityMetadata } from '@/lib/seo/metadata'
import { PublicHeader } from '@/components/public/PublicHeader'
import { PublicEventCard } from '@/components/public/PublicEventCard'
import { CommunityInteractive } from './CommunityInteractive'
import { Badge } from '@/components/ui/badge'
import { MapPin, Globe, ChevronLeft } from 'lucide-react'

export const revalidate = 300

type Props = { params: Promise<{ id: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const community = await getPublicCommunity(id)
  if (!community) return { title: 'Community Not Found - One Mic Stand' }
  return buildCommunityMetadata(community)
}

export default async function CommunityDetailPage({ params }: Props) {
  const { id } = await params
  const community = await getPublicCommunity(id)

  if (!community) notFound()

  const isArchived = false // getPublicCommunity only returns active communities

  return (
    <>
      <PublicHeader />

      <div className="min-h-screen bg-background pb-24">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Back nav */}
          <div className="flex items-center gap-2">
            <Link
              href="/communities"
              className="p-1 -ml-1 rounded hover:bg-muted shrink-0 flex items-center gap-1 text-sm text-muted-foreground"
              aria-label="Back to communities"
            >
              <ChevronLeft className="w-4 h-4" />
              Communities
            </Link>
          </div>

          {/* Community header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{community.name}</h1>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {community.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {community.location}
                </span>
              )}
              {community.language && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  {community.language}
                </span>
              )}
            </div>

            {community.description && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {community.description}
              </p>
            )}
          </div>

          {/* Interactive section: join/leave, member count, admin panels */}
          <CommunityInteractive
            communityId={community.id}
            communityName={community.name}
            initialMemberCount={community.memberCount}
            initialCantWaitCount={0}
            isArchived={isArchived}
          />

          {/* Upcoming events */}
          <section>
            <h2 className="text-base font-semibold mb-3">
              Upcoming Events
              {community.upcomingEventCount > 0 && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({community.upcomingEventCount})
                </span>
              )}
            </h2>

            {community.upcomingEvents.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {community.upcomingEvents.map((event) => (
                  <PublicEventCard key={event.id} event={event} />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border bg-muted/30 py-12 text-center">
                <p className="text-sm text-muted-foreground">No upcoming events yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Check back soon!</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}
