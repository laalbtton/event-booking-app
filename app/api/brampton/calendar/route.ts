import { NextResponse } from 'next/server'
import { buildIcsCalendar, type CalendarEventInput } from '@/lib/calendarLinks'
import { getBramptonWeekEvents } from '@/lib/server/bramptonEvents'
import { getSiteUrl } from '@/lib/server/emailUrl'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { upcomingAll } = await getBramptonWeekEvents()

  const events: CalendarEventInput[] = upcomingAll.map((event) => ({
    title: event.title,
    description: event.description,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.venue
      ? { name: event.venue.name, address: event.venue.address }
      : event.locationText,
    eventId: event.id,
    eventUrl: `${getSiteUrl()}/events/${event.slug || event.id}`,
  }))

  const body = buildIcsCalendar(events, 'This Week in Brampton — One Mic Stand')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="brampton-comedy.ics"',
      'Cache-Control': 'public, max-age=1800',
    },
  })
}
