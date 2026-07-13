import type { Metadata } from 'next'
import { MicNightDetail } from '@/components/laalbutton/MicNightDetail'
import {
  findNextTorontoOpenMicEvent,
  formatEventDateInToronto,
  formatEventTimeInToronto,
} from '@/lib/laalbutton/micEventLookup'
import { TORONTO_OPEN_MIC_STORY, TORONTO_STORY_INTRO } from '@/lib/laalbutton/micOpenMicStory'
import { getMicNight } from '@/lib/laalbutton/micNights'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Toronto Open Mic',
  description:
    'Weekly multilingual comedy open mic in Toronto every Thursday at SoCap. South Asian performers and comedy-curious newcomers welcome.',
  openGraph: {
    title: 'Toronto Open Mic | Laal Button Comedy',
    url: 'https://laalbutton.com/laalbutton/multilingual-comedy/toronto-open-mic',
  },
}

export default async function TorontoOpenMicPage() {
  const mic = getMicNight('toronto-open-mic')
  const nextEvent = await findNextTorontoOpenMicEvent()

  const displayTime = nextEvent ? formatEventTimeInToronto(nextEvent.startDate) : mic.time
  const displayTimeNote = nextEvent
    ? `From the next show in the app (${formatEventDateInToronto(nextEvent.startDate)}).`
    : undefined

  return (
    <MicNightDetail
      mic={mic}
      heroImageSrc={LB_MEDIA.torontoOpenMicDefault.src}
      heroImageAlt={LB_MEDIA.torontoOpenMicDefault.alt}
      displayTime={displayTime}
      displayTimeNote={displayTimeNote}
      nextEvent={
        nextEvent
          ? {
              href: `/events/${nextEvent.slug ?? nextEvent.id}`,
              title: nextEvent.title,
              dateLabel: formatEventDateInToronto(nextEvent.startDate),
            }
          : null
      }
      storyChapters={TORONTO_OPEN_MIC_STORY}
      storyIntro={TORONTO_STORY_INTRO}
    />
  )
}
