import type { Metadata } from 'next'
import { getAdminClient } from '@/lib/server/supabaseAdmin'
import { FOUNDING_MEMBER_LIMIT } from '@/lib/foundingMembers'
import { InsiderCampaign } from './InsiderCampaign'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Brampton Comedy Insider — Become a Founding Member',
  description:
    'Join Brampton Comedy Insider and become one of the first 500 founding members. Earn a free comedy ticket, exclusive invites, discounted tickets, and priority access to future comedy shows in Brampton.',
  openGraph: {
    title: 'Brampton Comedy Insider',
    description:
      'Become one of the first 500 founding members. Free comedy ticket, exclusive invites, and priority access to Brampton comedy shows.',
    type: 'website',
  },
}

async function getInitialSpots() {
  const supabase = getAdminClient()
  if (!supabase) {
    return { limit: FOUNDING_MEMBER_LIMIT, claimed: 0, remaining: FOUNDING_MEMBER_LIMIT }
  }
  const { count } = await supabase
    .from('founding_members')
    .select('id', { count: 'exact', head: true })
  const claimed = count ?? 0
  return {
    limit: FOUNDING_MEMBER_LIMIT,
    claimed,
    remaining: Math.max(0, FOUNDING_MEMBER_LIMIT - claimed),
  }
}

export default async function BramptonComedyInsiderPage() {
  const spots = await getInitialSpots()

  return (
    <InsiderCampaign
      initialClaimed={spots.claimed}
      initialRemaining={spots.remaining}
      limit={spots.limit}
    />
  )
}
