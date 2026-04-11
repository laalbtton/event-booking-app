'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const SORT_OPTIONS = [
  { value: 'date', label: 'Event date (soonest first)' },
  { value: 'near', label: 'Near me first' },
  { value: 'venue', label: 'Venue name (A–Z)' },
] as const

export function PublicEventsSort() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const raw = searchParams.get('sort')
  const value = raw === 'near' || raw === 'venue' ? raw : 'date'

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'date') params.delete('sort')
    else params.set('sort', next)
    const qs = params.toString()
    router.push(qs ? `/events?${qs}` : '/events', { scroll: false })
  }

  return (
    <div className="flex flex-col gap-1.5 sm:min-w-[220px]">
      <label htmlFor="public-events-sort" className="text-xs font-medium text-stone-500">
        Sort by
      </label>
      <select
        id="public-events-sort"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-zinc-600 bg-zinc-900 px-3 text-sm text-stone-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/40"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
