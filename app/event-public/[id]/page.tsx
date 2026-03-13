import { permanentRedirect, redirect } from 'next/navigation'
import { getPublicEventByIdentifier } from '@/lib/server/publicContent'

type Props = {
  params: Promise<{ id: string }>
}

export default async function LegacyPublicEventRoute({ params }: Props) {
  const { id } = await params
  const event = await getPublicEventByIdentifier(id)
  if (!event) {
    redirect('/signup')
  }

  if (event.slug) {
    permanentRedirect(`/events/${event.slug}`)
  }

  permanentRedirect(`/events/${event.id}`)
}
