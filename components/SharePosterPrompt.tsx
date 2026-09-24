'use client'

import { useEffect, useState } from 'react'
import { PosterShareActions } from '@/components/PosterShareActions'

type Props = {
  eventIdOrSlug: string
  title: string
  caption?: string | null
  eventDate?: string | null
  location?: string | null
  posterUrl?: string | null
}

export function SharePosterPrompt({
  eventIdOrSlug,
  title,
  caption,
  eventDate,
  location,
  posterUrl,
}: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setOpen(new URLSearchParams(window.location.search).get('share') === 'poster')
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-[60] border-t border-yellow-400/40 bg-zinc-950/95 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="mx-auto max-w-lg space-y-2">
        <p className="text-sm font-semibold text-yellow-400">Share this poster</p>
        <p className="text-xs text-stone-400">
          Share poster opens your phone’s share list. WhatsApp is the green button if it does not show up there.
        </p>
        <PosterShareActions
          emphasize
          eventIdOrSlug={eventIdOrSlug}
          title={title}
          caption={caption}
          eventDate={eventDate}
          location={location}
          posterUrl={posterUrl}
        />
      </div>
    </div>
  )
}
