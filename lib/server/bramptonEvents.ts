import { addCalendarDaysToYmd, getEasternCalendarDateString } from '@/lib/dateUtils'
import { getSiteUrl } from '@/lib/server/emailUrl'
import { listPublicEvents, type PublicEventDetails } from '@/lib/server/publicContent'

export function isBramptonEvent(event: PublicEventDetails): boolean {
  const hay = [
    event.venue?.city,
    event.venue?.name,
    event.venue?.address,
    event.locationText,
    event.title,
    event.communityName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return (
    hay.includes('brampton') ||
    hay.includes("ryan's chai") ||
    hay.includes('ryans chai')
  )
}

export function eventYmdEastern(iso: string): string {
  return getEasternCalendarDateString(iso)
}

export type BramptonWeekBundle = {
  thisWeek: PublicEventDetails[]
  comingUp: PublicEventDetails[]
  upcomingAll: PublicEventDetails[]
  weekLabel: string
  todayYmd: string
  weekEndYmd: string
}

function formatWeekLabel(startYmd: string, endYmd: string): string {
  const start = new Date(`${startYmd}T12:00:00`)
  const end = new Date(`${endYmd}T12:00:00`)
  const startStr = start.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  const endStr = end.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
  return `${startStr} – ${endStr}`
}

export async function getBramptonWeekEvents(): Promise<BramptonWeekBundle> {
  const all = await listPublicEvents(80, { upcomingOnly: true })
  const brampton = all
    .filter((e) => !e.isCancelled && isBramptonEvent(e))
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())

  const todayYmd = getEasternCalendarDateString()
  const weekEndYmd = addCalendarDaysToYmd(todayYmd, 6)
  const laterEndYmd = addCalendarDaysToYmd(todayYmd, 27)

  const thisWeek = brampton.filter((e) => {
    const y = eventYmdEastern(e.startDate)
    return y >= todayYmd && y <= weekEndYmd
  })
  const comingUp = brampton.filter((e) => {
    const y = eventYmdEastern(e.startDate)
    return y > weekEndYmd && y <= laterEndYmd
  })

  return {
    thisWeek,
    comingUp,
    upcomingAll: brampton,
    weekLabel: formatWeekLabel(todayYmd, weekEndYmd),
    todayYmd,
    weekEndYmd,
  }
}

export function bramptonCalendarSubscribeUrls() {
  const icsPath = '/api/brampton/calendar'
  const absIcs = `${getSiteUrl()}${icsPath}`
  const webcal = absIcs.replace(/^https:/, 'webcal:').replace(/^http:/, 'webcal:')
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(absIcs)}`
  return { icsPath, absIcs, webcal, google }
}
