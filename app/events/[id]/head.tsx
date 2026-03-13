import { getPublicEventByIdentifier } from '@/lib/server/publicContent'
import { buildEventJsonLd } from '@/lib/seo/schemaEvent'
import { getSiteUrl } from '@/lib/seo/metadata'

type Props = {
  params: Promise<{ id: string }>
}

export default async function Head({ params }: Props) {
  const { id } = await params
  const event = await getPublicEventByIdentifier(id)
  if (!event) return null
  const jsonLd = buildEventJsonLd(event, getSiteUrl())

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  )
}
