import { addCalendarDaysToYmd, getEasternCalendarDateString, getEasternWeekdayIndex } from '@/lib/dateUtils'
import type { PublicEventDetails } from '@/lib/server/publicContent'

export function getDateYmdBounds(preset: string): { fromYmd: string; toYmd: string } | null {
  const todayYmd = getEasternCalendarDateString()
  if (preset === 'today') {
    return { fromYmd: todayYmd, toYmd: todayYmd }
  }
  if (preset === 'this_week') {
    const dow = getEasternWeekdayIndex()
    const daysAhead = 6 - dow + 1
    return { fromYmd: todayYmd, toYmd: addCalendarDaysToYmd(todayYmd, daysAhead) }
  }
  if (preset === 'this_month') {
    const [y, m] = todayYmd.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return {
      fromYmd: todayYmd,
      toYmd: `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    }
  }
  return null
}

function venueSortKey(e: PublicEventDetails): string {
  return (e.venue?.name || e.locationText || '').toLowerCase()
}

export function parseSortMode(raw: string | undefined): 'date' | 'near' | 'venue' {
  if (raw === 'near' || raw === 'venue') return raw
  return 'date'
}

export function filterAndSortEvents(
  events: PublicEventDetails[],
  {
    city,
    datePreset,
    eventType,
    free,
    geoCity,
    sortMode,
    skipDatePreset,
    cityPredicate,
  }: {
    city: string
    datePreset: string
    eventType: string
    free: string
    geoCity: string | null
    sortMode: 'date' | 'near' | 'venue'
    skipDatePreset?: boolean
    cityPredicate?: (event: PublicEventDetails) => boolean
  }
): { upcoming: PublicEventDetails[]; past: PublicEventDetails[] } {
  const now = new Date()

  let filtered = events.filter(
    (e) => !['cancelled', 'archived', 'draft', 'private'].includes((e.status || '').toLowerCase())
  )

  const cityQuery = city.trim().toLowerCase()
  if (cityPredicate) {
    filtered = filtered.filter(cityPredicate)
  } else if (cityQuery) {
    filtered = filtered.filter((e) => {
      const eventCity = (e.venue?.city || e.locationText || '').toLowerCase()
      return eventCity.includes(cityQuery)
    })
  }

  const dateBounds = skipDatePreset ? null : getDateYmdBounds(datePreset)
  if (dateBounds) {
    filtered = filtered.filter((e) => {
      const ymd = getEasternCalendarDateString(e.startDate)
      return ymd >= dateBounds.fromYmd && ymd <= dateBounds.toYmd
    })
  }

  if (eventType) {
    filtered = filtered.filter((e) => {
      if (eventType === 'booked_show') return e.eventType === 'booked_show'
      if (eventType === 'comedy_open_mic') return e.eventType === 'open_mic' && e.openMicType === 'comedy_open_mic'
      if (eventType === 'variety_arts_open_mic') return e.eventType === 'open_mic' && e.openMicType === 'variety_arts_open_mic'
      return true
    })
  }

  if (free === 'free') filtered = filtered.filter((e) => e.isFree)
  if (free === 'paid') filtered = filtered.filter((e) => !e.isFree)

  const upcoming = filtered.filter((e) => new Date(e.startDate) >= now)
  const past = filtered.filter((e) => new Date(e.startDate) < now)

  if (sortMode === 'venue') {
    upcoming.sort((a, b) => {
      const va = venueSortKey(a)
      const vb = venueSortKey(b)
      if (va !== vb) return va.localeCompare(vb)
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
    past.sort((a, b) => {
      const va = venueSortKey(a)
      const vb = venueSortKey(b)
      if (va !== vb) return va.localeCompare(vb)
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })
  } else if (sortMode === 'near' && geoCity && !cityQuery) {
    const geoCityLower = geoCity.toLowerCase()
    upcoming.sort((a, b) => {
      const aCity = (a.venue?.city || a.locationText || '').toLowerCase()
      const bCity = (b.venue?.city || b.locationText || '').toLowerCase()
      const aMatch = aCity.includes(geoCityLower) ? 0 : 1
      const bMatch = bCity.includes(geoCityLower) ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
    })
    past.sort((a, b) => {
      const aCity = (a.venue?.city || a.locationText || '').toLowerCase()
      const bCity = (b.venue?.city || b.locationText || '').toLowerCase()
      const aMatch = aCity.includes(geoCityLower) ? 0 : 1
      const bMatch = bCity.includes(geoCityLower) ? 0 : 1
      if (aMatch !== bMatch) return aMatch - bMatch
      return new Date(b.startDate).getTime() - new Date(a.startDate).getTime()
    })
  } else {
    upcoming.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    past.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
  }

  return { upcoming, past }
}
