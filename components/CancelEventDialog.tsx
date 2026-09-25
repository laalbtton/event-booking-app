'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type SeriesCancelScope = 'this' | 'this_and_following' | 'all'

type Props = {
  open: boolean
  eventTitle: string
  isSeries: boolean
  submitting?: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (scope: SeriesCancelScope) => void
}

export function CancelEventDialog({
  open,
  eventTitle,
  isSeries,
  submitting = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const [scope, setScope] = useState<SeriesCancelScope>('this')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setScope('this')
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel event?</DialogTitle>
          <DialogDescription className="whitespace-pre-line text-sm leading-6">
            {isSeries
              ? `Cancel "${eventTitle}" and refund attendees. This is a recurring series — choose how far the cancellation should go. This cannot be undone.`
              : `Cancel "${eventTitle}" and refund all attendees? This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {isSeries && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
            <p className="text-sm font-medium text-amber-900">Apply cancellation to:</p>
            <div className="flex flex-col gap-1.5">
              {(
                [
                  ['this', 'This occurrence only'],
                  ['this_and_following', 'This and all following occurrences'],
                  ['all', 'All remaining events in the series'],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 text-sm text-amber-800 cursor-pointer">
                  <input
                    type="radio"
                    name="series-cancel-scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className="h-4 w-4"
                    disabled={submitting}
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Keep event
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={submitting}
            onClick={() => onConfirm(isSeries ? scope : 'this')}
          >
            {submitting ? 'Cancelling…' : 'Yes, cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
