'use client'

import { Button } from '@/components/ui/button'
import {
  buildEventShareUrl,
  buildPosterShareText,
  openWhatsAppShare,
  sharePosterNative,
} from '@/lib/posterShare'
import { toast } from 'sonner'

type Props = {
  eventIdOrSlug: string
  title: string
  caption?: string | null
  eventDate?: string | null
  location?: string | null
  posterUrl?: string | null
  /** Larger primary buttons for the notification deep-link. */
  emphasize?: boolean
}

export function PosterShareActions({
  eventIdOrSlug,
  title,
  caption,
  eventDate,
  location,
  posterUrl,
  emphasize = false,
}: Props) {
  const eventUrl = buildEventShareUrl(eventIdOrSlug)
  const text = buildPosterShareText({
    title,
    caption,
    eventUrl,
    eventDate,
    location,
  })

  async function handleShare() {
    const result = await sharePosterNative({
      title: `${title} poster`,
      text,
      eventUrl,
      posterUrl,
    })
    if (result === 'copied') toast.success('Share text copied — paste it into WhatsApp or any chat')
  }

  function handleWhatsApp() {
    openWhatsAppShare(text)
  }

  const btnSize = emphasize ? 'lg' : 'sm'
  const stack = emphasize ? 'flex flex-col sm:flex-row gap-2' : 'flex flex-wrap gap-2'

  return (
    <div className={stack}>
      <Button size={btnSize} className={emphasize ? 'w-full sm:flex-1 font-semibold' : undefined} onClick={handleShare}>
        Share poster
      </Button>
      <Button
        size={btnSize}
        type="button"
        className={
          emphasize
            ? 'w-full sm:flex-1 font-semibold bg-[#25D366] hover:bg-[#1ebe5d] text-white'
            : 'bg-[#25D366] hover:bg-[#1ebe5d] text-white'
        }
        onClick={handleWhatsApp}
      >
        WhatsApp
      </Button>
    </div>
  )
}
