import type { Metadata } from 'next'
import { MicNightDetail } from '@/components/laalbutton/MicNightDetail'
import { BRAMPTON_OPEN_MIC_STORY, BRAMPTON_STORY_INTRO } from '@/lib/laalbutton/micOpenMicStory'
import {
  findNextBramptonOpenMicEvent,
  formatEventDateInToronto,
  formatEventTimeInToronto,
} from '@/lib/laalbutton/micEventLookup'
import { getMicNight } from '@/lib/laalbutton/micNights'
import { LB_MEDIA } from '@/lib/laalbutton/media'

export const revalidate = 600

export const metadata: Metadata = {
  title: 'Brampton Open Mic',
  description:
    "Weekly multilingual comedy open mic in Brampton every Wednesday at Ryan's Chai. Free entry. Perform in Punjabi, Hindi, Urdu, or English.",
  openGraph: {
    title: 'Brampton Open Mic | Laal Button Comedy',
    url: 'https://laalbutton.com/laalbutton/multilingual-comedy/brampton-open-mic',
  },
}

export default async function BramptonOpenMicPage() {
  const mic = getMicNight('brampton-open-mic')
  const nextEvent = await findNextBramptonOpenMicEvent()

  const displayTime = nextEvent ? formatEventTimeInToronto(nextEvent.startDate) : mic.time
  const displayTimeNote = nextEvent
    ? `From the next show in the app (${formatEventDateInToronto(nextEvent.startDate)}).`
    : undefined

  return (
    <MicNightDetail
      mic={mic}
      heroImageSrc={LB_MEDIA.bramptonOpenMicGeneric.src}
      heroImageAlt={LB_MEDIA.bramptonOpenMicGeneric.alt}
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
      storyChapters={BRAMPTON_OPEN_MIC_STORY}
      storyIntro={BRAMPTON_STORY_INTRO}
    />
  )
}
