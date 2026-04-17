'use client'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CommunitiesSearch } from './CommunitiesSearch'
import { SpacesSearch } from './SpacesSearch'
import type { PublicCommunity } from '@/lib/server/publicCommunities'
import type { PublicVenue } from '@/lib/server/publicVenues'
import { Users, Building2 } from 'lucide-react'

type Props = {
  communities: PublicCommunity[]
  venues: PublicVenue[]
}

export function CommunitiesTabs({ communities, venues }: Props) {
  return (
    <Tabs defaultValue="communities">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="communities" className="gap-1.5">
          <Users className="h-4 w-4" />
          Communities
        </TabsTrigger>
        <TabsTrigger value="spaces" className="gap-1.5">
          <Building2 className="h-4 w-4" />
          Spaces
        </TabsTrigger>
      </TabsList>

      <TabsContent value="communities" className="mt-0">
        <CommunitiesSearch communities={communities} />
      </TabsContent>

      <TabsContent value="spaces" className="mt-0">
        <SpacesSearch venues={venues} />
      </TabsContent>
    </Tabs>
  )
}
