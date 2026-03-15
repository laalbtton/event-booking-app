'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const EVENT_TYPES = [
  { value: 'comedy_open_mic', label: 'Comedy Open Mic' },
  { value: 'variety_arts_open_mic', label: 'Variety Arts' },
  { value: 'booked_show', label: 'Booked Show' },
]

const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
]

type FilterState = {
  city: string
  datePreset: string
  eventType: string
  free: string
}

export function PublicEventsFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [filters, setFilters] = useState<FilterState>({
    city: searchParams.get('city') || '',
    datePreset: searchParams.get('date') || '',
    eventType: searchParams.get('type') || '',
    free: searchParams.get('free') || '',
  })
  const [expanded, setExpanded] = useState(false)
  const cityInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const activeCount = [filters.city, filters.datePreset, filters.eventType, filters.free].filter(Boolean).length

  const applyFilters = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams()
      if (next.city) params.set('city', next.city)
      if (next.datePreset) params.set('date', next.datePreset)
      if (next.eventType) params.set('type', next.eventType)
      if (next.free) params.set('free', next.free)
      const qs = params.toString()
      router.push(qs ? `/events?${qs}` : '/events', { scroll: false })
    },
    [router]
  )

  function update(key: keyof FilterState, value: string) {
    const next = { ...filters, [key]: value }
    setFilters(next)
    if (key === 'city') {
      clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => applyFilters(next), 500)
    } else {
      applyFilters(next)
    }
  }

  function clearAll() {
    const cleared: FilterState = { city: '', datePreset: '', eventType: '', free: '' }
    setFilters(cleared)
    router.push('/events', { scroll: false })
  }

  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  return (
    <div className="space-y-3">
      {/* Top bar: city search + expand toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" />
          </svg>
          <Input
            ref={cityInputRef}
            placeholder="Filter by city..."
            value={filters.city}
            onChange={(e) => update('city', e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 relative"
        >
          Filters
          {activeCount > 0 && (
            <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onClick={clearAll} className="shrink-0 text-muted-foreground">
            Clear
          </Button>
        )}
      </div>

      {/* Expanded filters */}
      {expanded && (
        <div className="rounded-xl border bg-card p-4 space-y-4">
          {/* Date presets */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Date</p>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => update('datePreset', filters.datePreset === preset.value ? '' : preset.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    filters.datePreset === preset.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Event type */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Event Type</p>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => update('eventType', filters.eventType === type.value ? '' : type.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    filters.eventType === type.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* Free / paid */}
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Admission</p>
            <div className="flex flex-wrap gap-2">
              {[{ value: 'free', label: 'Free events' }, { value: 'paid', label: 'Ticketed events' }].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update('free', filters.free === opt.value ? '' : opt.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    filters.free === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-accent'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
