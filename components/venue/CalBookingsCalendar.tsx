'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useSwipeNavigate } from '@/lib/hooks/useSwipeNavigate'

// ─── Types ───────────────────────────────────────────────────────────────────

export type BookingEntry = {
  id: string
  title: string
  startTime: string
  endTime: string | null
  status: string
  source: 'calcom' | 'app'
  attendeeName?: string
  attendeeEmail?: string
  location?: string
  description?: string
  eventSlug?: string
  eventType?: string
}

type Props = {
  venueId: string
  /** true on the manage page — shows attendee names for Cal.com bookings */
  showDetails?: boolean
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const HOUR_START = 8   // 8 am
const HOUR_END = 23    // 11 pm
const SLOT_PX = 26     // px per 30-min row

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function getSundayWeekStart(d: Date): Date {
  const w = new Date(d)
  w.setDate(w.getDate() - w.getDay())
  w.setHours(0, 0, 0, 0)
  return w
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
  // pad to 42 cells (6 rows)
  let nextDay = 1
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, nextDay++), inMonth: false })
  }
  return cells
}

function minsFromMidnight(iso: string): number {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function bookingChipCls(b: BookingEntry): string {
  return b.source === 'calcom'
    ? 'bg-indigo-500 text-white border-indigo-600'
    : 'bg-amber-400 text-amber-950 border-amber-500'
}

function bookingDotCls(b: BookingEntry): string {
  return b.source === 'calcom' ? 'bg-indigo-500' : 'bg-amber-400'
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CalBookingsCalendar({ venueId, showDetails = false }: Props) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [navDate, setNavDate] = useState(() => new Date())
  const [bookings, setBookings] = useState<BookingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<BookingEntry | null>(null)

  const year = navDate.getFullYear()
  const month = navDate.getMonth()

  const weekStart = useMemo(() => getSundayWeekStart(navDate), [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    navDate.toDateString(),
  ])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      let from: Date, to: Date
      if (view === 'month') {
        from = new Date(year, month - 1, 1)
        to = new Date(year, month + 2, 0)
      } else {
        from = new Date(weekStart)
        to = new Date(weekStart)
        to.setDate(to.getDate() + 7)
      }
      const res = await fetch(
        `/api/cal/bookings?venueId=${encodeURIComponent(venueId)}&from=${from.toISOString()}&to=${to.toISOString()}`,
      )
      const data = await res.json()
      setBookings((data.bookings as BookingEntry[]) ?? [])
    } catch {
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [venueId, view, year, month, weekStart])

  useEffect(() => { load() }, [load])

  // ── Navigation ─────────────────────────────────────────────────────────────
  function navigate(dir: 1 | -1) {
    setNavDate((d) => {
      if (view === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1)
      const n = new Date(d)
      n.setDate(n.getDate() + dir * 7)
      return n
    })
  }

  const swipeNav = useSwipeNavigate({
    onSwipeLeft: () => navigate(1),
    onSwipeRight: () => navigate(-1),
    enabled: !loading,
  })

  // ── Derived data ───────────────────────────────────────────────────────────
  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])

  const monthCells = useMemo(() => getMonthCells(year, month), [year, month])

  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart)
        d.setDate(weekStart.getDate() + i)
        return d
      }),
    [weekStart],
  )

  function bookingsOn(day: Date): BookingEntry[] {
    return bookings.filter((b) => isSameDay(new Date(b.startTime), day))
  }

  const totalSlots = (HOUR_END - HOUR_START) * 2
  const totalH = totalSlots * SLOT_PX

  const navTitle =
    view === 'month'
      ? `${MONTH_NAMES[month]} ${year}`
      : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="rounded-xl border border-border bg-card overflow-hidden"
      aria-label="Calendar — swipe left or right to change period"
    >
      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigate(-1)}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold w-52 text-center select-none">
            {navTitle}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => navigate(1)}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border border-border p-0.5 gap-0.5">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded capitalize transition-colors',
                view === v
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 px-4 py-1.5 border-b border-border bg-muted/20 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
          App events
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
          Cal.com bookings
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Loading calendar…
        </div>
      )}

      {/* ── Month View ── */}
      {!loading && view === 'month' && (
        <div
          onTouchStart={swipeNav.onTouchStart}
          onTouchEnd={swipeNav.onTouchEnd}
          className={cn(swipeNav.className, 'select-none')}
        >
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 border-b border-border bg-muted/10">
            {DAY_LABELS.map((l) => (
              <div
                key={l}
                className="py-1.5 text-center text-xs font-medium text-muted-foreground"
              >
                {l}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {monthCells.map((cell, idx) => {
              const dayBk = bookingsOn(cell.date)
              const isToday = isSameDay(cell.date, today)
              const isPast = cell.date < today
              return (
                <div
                  key={idx}
                  className={cn(
                    'min-h-[82px] border-b border-r border-border p-1',
                    !cell.inMonth && 'bg-muted/10',
                    idx % 7 === 6 && 'border-r-0',
                    idx >= 35 && 'border-b-0',
                  )}
                >
                  {/* Day number */}
                  <div className="flex justify-start mb-0.5">
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-xs',
                        isToday &&
                          'bg-foreground text-background font-bold',
                        !isToday && !cell.inMonth &&
                          'text-muted-foreground/30',
                        !isToday && cell.inMonth && isPast &&
                          'text-muted-foreground/60',
                        !isToday && cell.inMonth && !isPast && 'font-medium',
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                  </div>

                  {/* Booking chips */}
                  <div className="space-y-0.5">
                    {dayBk.slice(0, 2).map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className={cn(
                          'w-full text-left text-[10px] px-1 py-0.5 rounded border truncate font-medium leading-tight',
                          bookingChipCls(b),
                          'hover:opacity-80 transition-opacity',
                        )}
                        title={b.title}
                      >
                        {fmtTime(b.startTime)} {b.title}
                      </button>
                    ))}
                    {dayBk.length > 2 && (
                      <button
                        className="w-full text-left text-[10px] text-muted-foreground hover:underline px-1 leading-tight"
                        onClick={() => setSelected(dayBk[2])}
                      >
                        +{dayBk.length - 2} more
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Week View ── */}
      {!loading && view === 'week' && (
        <div
          onTouchStart={swipeNav.onTouchStart}
          onTouchEnd={swipeNav.onTouchEnd}
          className={cn(swipeNav.className, 'overflow-auto select-none')}
          style={{ maxHeight: '560px' }}
        >
          {/* Sticky column headers */}
          <div
            className="flex sticky top-0 z-20 bg-card border-b border-border"
          >
            <div className="w-10 shrink-0 border-r border-border" />
            {weekDays.map((day, i) => {
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={i}
                  className={cn(
                    'flex-1 min-w-0 py-1.5 text-center border-r border-border last:border-r-0',
                    isToday && 'bg-muted/30',
                  )}
                >
                  <p className="text-[10px] text-muted-foreground">
                    {DAY_LABELS[day.getDay()]}
                  </p>
                  <p
                    className={cn(
                      'text-sm font-semibold leading-tight',
                      isToday && 'text-foreground',
                    )}
                  >
                    {day.getDate()}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Time grid */}
          <div className="flex" style={{ height: `${totalH}px` }}>
            {/* Hour labels column */}
            <div className="w-10 shrink-0 relative border-r border-border">
              {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => {
                const h = HOUR_START + i
                const label =
                  h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
                return (
                  <div
                    key={h}
                    className="absolute right-1 text-[9px] text-muted-foreground/60 leading-none"
                    style={{ top: `${i * 2 * SLOT_PX - 5}px` }}
                  >
                    {label}
                  </div>
                )
              })}
            </div>

            {/* Day columns */}
            {weekDays.map((day, dayIdx) => {
              const dayBk = bookingsOn(day)
              const isToday = isSameDay(day, today)
              return (
                <div
                  key={dayIdx}
                  className={cn(
                    'flex-1 min-w-0 relative border-r border-border last:border-r-0',
                    isToday && 'bg-muted/10',
                  )}
                  style={{ height: `${totalH}px` }}
                >
                  {/* Hour separator lines */}
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div
                      key={`h${i}`}
                      className="absolute left-0 right-0 border-t border-border/30"
                      style={{ top: `${i * 2 * SLOT_PX}px` }}
                    />
                  ))}
                  {/* Half-hour dashed lines */}
                  {Array.from({ length: HOUR_END - HOUR_START }, (_, i) => (
                    <div
                      key={`hh${i}`}
                      className="absolute left-0 right-0 border-t border-dashed border-border/15"
                      style={{ top: `${(i * 2 + 1) * SLOT_PX}px` }}
                    />
                  ))}

                  {/* Booking blocks */}
                  {dayBk.map((b) => {
                    const startMins = minsFromMidnight(b.startTime)
                    const endMins = b.endTime
                      ? minsFromMidnight(b.endTime)
                      : startMins + 60
                    const topPx =
                      ((startMins - HOUR_START * 60) / 30) * SLOT_PX
                    const heightPx = Math.max(
                      SLOT_PX,
                      ((endMins - startMins) / 30) * SLOT_PX - 2,
                    )
                    if (topPx < 0 || topPx >= totalH) return null
                    return (
                      <button
                        key={b.id}
                        onClick={() => setSelected(b)}
                        className={cn(
                          'absolute left-0.5 right-0.5 rounded border text-left overflow-hidden z-10',
                          'hover:opacity-80 transition-opacity px-1 py-0.5',
                          bookingChipCls(b),
                        )}
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                        }}
                        title={`${fmtTime(b.startTime)} – ${b.title}`}
                      >
                        <p className="text-[9px] font-semibold leading-tight truncate">
                          {fmtTime(b.startTime)}
                        </p>
                        <p className="text-[9px] leading-tight truncate">
                          {b.title}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Detail Dialog ── */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="pr-6 text-base leading-snug">
                {selected.title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              {/* Date & time */}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Date &amp; time
                </p>
                <p className="font-medium">{fmtDateFull(selected.startTime)}</p>
                <p className="text-muted-foreground">
                  {fmtTime(selected.startTime)}
                  {selected.endTime && ` – ${fmtTime(selected.endTime)}`}
                </p>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-1.5">
                <Badge
                  variant="secondary"
                  className={cn(
                    'text-xs border',
                    selected.source === 'calcom'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200',
                  )}
                >
                  {selected.source === 'calcom'
                    ? 'Cal.com booking'
                    : 'App event'}
                </Badge>
                {selected.status && (
                  <Badge variant="outline" className="text-xs capitalize">
                    {selected.status.toLowerCase()}
                  </Badge>
                )}
              </div>

              {/* Attendee — only on manage page for Cal.com bookings */}
              {showDetails &&
                selected.source === 'calcom' &&
                selected.attendeeName && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">
                      Booked by
                    </p>
                    <p className="font-medium">{selected.attendeeName}</p>
                    {selected.attendeeEmail && (
                      <a
                        href={`mailto:${selected.attendeeEmail}`}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        {selected.attendeeEmail}
                      </a>
                    )}
                  </div>
                )}

              {/* Location */}
              {selected.location && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Location
                  </p>
                  <p>{selected.location}</p>
                </div>
              )}

              {/* Description / notes */}
              {selected.description && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Notes
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {selected.description}
                  </p>
                </div>
              )}

              {/* Link to app event */}
              {selected.source === 'app' && selected.eventSlug && (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                >
                  <Link
                    href={`/events/${selected.eventSlug}`}
                    target="_blank"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View event page
                  </Link>
                </Button>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
