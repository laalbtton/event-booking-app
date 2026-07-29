'use client'

import { useMemo } from 'react'
import { CalendarPlus, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  buildGoogleCalendarUrl,
  buildIcsBlobUrl,
  getCalendarEventUrl,
  sanitizeIcsFilename,
  type CalendarEventInput,
} from '@/lib/calendarLinks'
import { cn } from '@/lib/utils'

type CalendarEventLike = {
  id: string
  title: string
  description?: string | null
  date: string
  end_time?: string | null
  location?: unknown
}

type AddToCalendarButtonsProps = {
  event: CalendarEventLike
  className?: string
  layout?: 'row' | 'stack'
}

export function AddToCalendarButtons({
  event,
  className,
  layout = 'stack',
}: AddToCalendarButtonsProps) {
  const calendarInput = useMemo<CalendarEventInput>(
    () => ({
      title: event.title,
      description: event.description,
      startDate: event.date,
      endDate: event.end_time,
      location: event.location,
      eventId: event.id,
      eventUrl: getCalendarEventUrl(event.id),
    }),
    [event]
  )

  const googleUrl = useMemo(
    () => buildGoogleCalendarUrl(calendarInput),
    [calendarInput]
  )

  function handleDownloadIcs() {
    const url = buildIcsBlobUrl(calendarInput)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${sanitizeIcsFilename(event.title)}.ics`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div
      className={cn(
        layout === 'row' ? 'flex flex-wrap gap-2' : 'flex flex-col gap-2',
        className
      )}
    >
      <Button
        asChild
        variant="outline"
        size="sm"
        className={layout === 'stack' ? 'w-full' : undefined}
      >
        <a href={googleUrl} target="_blank" rel="noopener noreferrer">
          <CalendarPlus className="w-4 h-4" />
          Add to Google Calendar
        </a>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={layout === 'stack' ? 'w-full' : undefined}
        onClick={handleDownloadIcs}
      >
        <Download className="w-4 h-4" />
        Download .ics
      </Button>
    </div>
  )
}
