'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, LayoutList } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PublicEventsViewToggle() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = searchParams.get('view') === 'calendar' ? 'calendar' : 'list'

  function setView(next: 'list' | 'calendar') {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'list') params.delete('view')
    else params.set('view', 'calendar')
    const qs = params.toString()
    router.push(qs ? `/events?${qs}` : '/events', { scroll: false })
  }

  return (
    <div
      className="inline-flex rounded-lg border border-zinc-600 bg-zinc-900 p-0.5 shrink-0"
      role="tablist"
      aria-label="Events view"
    >
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        onClick={() => setView('list')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors',
          view === 'list'
            ? 'bg-yellow-400 text-zinc-950'
            : 'text-stone-400 hover:text-stone-100'
        )}
      >
        <LayoutList className="h-4 w-4" />
        List
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'calendar'}
        onClick={() => setView('calendar')}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-3 h-9 text-sm font-medium transition-colors',
          view === 'calendar'
            ? 'bg-yellow-400 text-zinc-950'
            : 'text-stone-400 hover:text-stone-100'
        )}
      >
        <CalendarDays className="h-4 w-4" />
        Calendar
      </button>
    </div>
  )
}
