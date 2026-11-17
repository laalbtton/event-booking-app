'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  going: boolean
  interested: boolean
  waitlisted?: boolean
  bookingId?: string | null
  goingCount?: number
  interestedCount?: number
  loading?: 'going' | 'interested' | null
  disabled?: boolean
  size?: 'sm' | 'default'
  onGoing: () => void
  onInterested: () => void
}

export function FreeRsvpButtons({
  going,
  interested,
  waitlisted,
  bookingId,
  goingCount,
  interestedCount,
  loading,
  disabled,
  size = 'sm',
  onGoing,
  onInterested,
}: Props) {
  const busy = !!loading || disabled

  return (
    <div className="flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
      {(goingCount != null || interestedCount != null) && (
        <p className="text-xs text-muted-foreground">
          {goingCount != null ? `${goingCount} going` : null}
          {goingCount != null && interestedCount != null ? ' · ' : null}
          {interestedCount != null ? `${interestedCount} interested` : null}
        </p>
      )}
      {going || waitlisted ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            {waitlisted ? 'Waitlisted' : "You're going"}
          </span>
          {bookingId ? (
            <Button asChild size={size}>
              <Link href={`/bookings/${bookingId}`}>View RSVP</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size={size}
            variant={interested ? 'secondary' : 'outline'}
            disabled={busy}
            onClick={onInterested}
            className={cn(interested && 'border-yellow-400 bg-yellow-400/15 text-yellow-800 dark:text-yellow-300')}
          >
            {loading === 'interested' ? 'Saving…' : interested ? 'Interested' : 'Interested'}
          </Button>
          <Button type="button" size={size} disabled={busy} onClick={onGoing}>
            {loading === 'going' ? 'Saving…' : "I'm going"}
          </Button>
        </div>
      )}
    </div>
  )
}
