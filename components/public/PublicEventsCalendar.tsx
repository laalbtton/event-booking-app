'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useSwipeNavigate } from '@/lib/hooks/useSwipeNavigate'
import type { PublicEventDetails } from '@/lib/server/publicContent'
import { formatEventTimeEastern, getEasternCalendarDateString } from '@/lib/dateUtils'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

type Props = {
  events: PublicEventDetails[]
  cityFilter?: string | null
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function getMonthCells(year: number, month: number) {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month, -i), inMonth: false })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(year, month, d), inMonth: true })
  }
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay++), inMonth: false })
  }
  return cells
}

function formatEventTime(dateIso: string): string {
  return formatEventTimeEastern(dateIso)
}

function formatSelectedDate(d: Date): string {
  return d.toLocaleDateString('en-CA', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function PublicEventsCalendar({ events, cityFilter }: Props) {
  const today = useMemo(() => startOfDay(new Date()), [])
  const [navDate, setNavDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(today))

  const year = navDate.getFullYear()
  const month = navDate.getMonth()
  const monthCells = useMemo(() => getMonthCells(year, month), [year, month])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, PublicEventDetails[]>()
    for (const event of events) {
      const key = getEasternCalendarDateString(event.startDate)
      const list = map.get(key) || []
      list.push(event)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    }
    return map
  }, [events])

  const selectedEvents = eventsByDay.get(selectedKey) || []
  const selectedDate = new Date(`${selectedKey}T12:00:00`)

  function goMonth(delta: number) {
    const next = new Date(navDate.getFullYear(), navDate.getMonth() + delta, 1)
    setNavDate(next)
    setSelectedKey(toDateKey(next))
  }

  function jumpToToday() {
    setNavDate(new Date(today.getFullYear(), today.getMonth(), 1))
    setSelectedKey(toDateKey(today))
  }

  const swipeNav = useSwipeNavigate({
    onSwipeLeft: () => goMonth(1),
    onSwipeRight: () => goMonth(-1),
  })

  return (
    <section className="space-y-4">
      <div
        className="rounded-xl border border-red-600/55 bg-zinc-900 overflow-hidden"
        aria-label="Events calendar — swipe left or right to change month"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 border-b border-zinc-700">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-stone-200 hover:bg-zinc-800"
              onClick={() => goMonth(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-sm sm:text-base font-semibold text-stone-100 min-w-[9.5rem] text-center select-none">
              {MONTH_NAMES[month]} {year}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-stone-200 hover:bg-zinc-800"
              onClick={() => goMonth(1)}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <button
            type="button"
            onClick={jumpToToday}
            className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 px-2 py-1"
          >
            Today
          </button>
        </div>

        <div className="flex gap-4 px-3 py-2 border-b border-zinc-800 text-xs text-stone-400">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400 shrink-0" />
            Upcoming
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-stone-500 shrink-0" />
            Past
          </span>
        </div>

        <div
          onTouchStart={swipeNav.onTouchStart}
          onTouchEnd={swipeNav.onTouchEnd}
          className={cn(swipeNav.className, 'select-none')}
        >
          <div className="grid grid-cols-7 border-b border-zinc-800 bg-zinc-950/40">
            {DAY_LABELS.map((label) => (
              <div key={label} className="py-1.5 text-center text-[11px] font-medium text-stone-500">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {monthCells.map((cell, idx) => {
              const key = toDateKey(cell.date)
              const dayEvents = eventsByDay.get(key) || []
              const isToday = isSameDay(cell.date, today)
              const isSelected = key === selectedKey
              const isPastDay = cell.date < today
              const upcomingCount = dayEvents.filter((e) => new Date(e.startDate) >= today).length
              const pastCount = dayEvents.length - upcomingCount

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedKey(key)}
                  className={cn(
                    'min-h-[52px] sm:min-h-[88px] border-b border-r border-zinc-800 p-1 text-left align-top',
                    !cell.inMonth && 'bg-zinc-950/50',
                    idx % 7 === 6 && 'border-r-0',
                    idx >= 35 && 'border-b-0',
                    isSelected && 'bg-yellow-400/10 ring-1 ring-inset ring-yellow-400/70'
                  )}
                  aria-label={`${cell.date.toLocaleDateString('en-CA', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                  })}${dayEvents.length ? `, ${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}` : ''}`}
                  aria-pressed={isSelected}
                >
                  <span
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs',
                      isToday && 'bg-yellow-400 text-zinc-950 font-bold',
                      !isToday && !cell.inMonth && 'text-stone-600',
                      !isToday && cell.inMonth && isPastDay && 'text-stone-500',
                      !isToday && cell.inMonth && !isPastDay && 'text-stone-100 font-medium'
                    )}
                  >
                    {cell.date.getDate()}
                  </span>

                  <div className="mt-0.5 flex flex-wrap gap-0.5 sm:hidden">
                    {upcomingCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-yellow-400" />}
                    {pastCount > 0 && <span className="h-1.5 w-1.5 rounded-full bg-stone-500" />}
                  </div>

                  <div className="mt-1 hidden sm:block space-y-0.5">
                    {dayEvents.slice(0, 2).map((event) => {
                      const isPast = new Date(event.startDate) < today
                      return (
                        <div
                          key={event.id}
                          className={cn(
                            'text-[10px] leading-tight truncate px-1 py-0.5 rounded font-medium',
                            isPast ? 'bg-zinc-800 text-stone-400' : 'bg-yellow-400/90 text-zinc-950'
                          )}
                          title={event.title}
                        >
                          {event.title}
                        </div>
                      )
                    })}
                    {dayEvents.length > 2 && (
                      <div className="text-[10px] text-stone-500 px-1">+{dayEvents.length - 2} more</div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-stone-300 mb-3">{formatSelectedDate(selectedDate)}</h3>
        {selectedEvents.length === 0 ? (
          <p className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-8 text-center text-sm text-stone-400">
            No events on this day.
          </p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((event) => {
              const isPast = new Date(event.startDate) < new Date()
              const venueName = event.venue?.name || event.locationText || 'Venue TBA'
              const city = event.venue?.city
              const highlightCity =
                cityFilter && city && city.toLowerCase().includes(cityFilter.toLowerCase())
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.slug || event.id}`}
                    className="flex items-start gap-3 rounded-xl border border-red-600/55 bg-zinc-900 p-3 hover:border-red-500/80 transition-colors"
                  >
                    <div className="w-16 shrink-0 pt-0.5">
                      <p className="text-xs font-semibold text-yellow-400">{formatEventTime(event.startDate)}</p>
                      {isPast && <p className="text-[10px] uppercase tracking-wide text-stone-500 mt-1">Past</p>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-stone-100 leading-snug">{event.title}</p>
                      <p className="text-sm text-stone-400 mt-0.5 truncate">
                        {venueName}
                        {city ? (
                          <>
                            {' · '}
                            <span className={highlightCity ? 'text-yellow-400' : undefined}>{city}</span>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
