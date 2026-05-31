'use client'

import { useRef, useCallback } from 'react'

type Options = {
  /** Finger swipes left → typically advance (next month/week). */
  onSwipeLeft?: () => void
  /** Finger swipes right → typically go back (previous month/week). */
  onSwipeRight?: () => void
  enabled?: boolean
  /** Minimum horizontal movement in px. */
  threshold?: number
}

/**
 * Touch handlers for calendar-style horizontal navigation.
 * Ignores swipes that are mostly vertical (so the page can still scroll).
 */
export function useSwipeNavigate({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  threshold = 48,
}: Options) {
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      startX.current = e.touches[0].clientX
      startY.current = e.touches[0].clientY
      active.current = true
    },
    [enabled],
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || !active.current) return
      active.current = false
      const touch = e.changedTouches[0]
      if (!touch) return

      const dx = touch.clientX - startX.current
      const dy = touch.clientY - startY.current
      if (Math.abs(dx) < threshold) return
      if (Math.abs(dx) < Math.abs(dy) * 1.25) return

      if (dx < 0) onSwipeLeft?.()
      else onSwipeRight?.()
    },
    [enabled, threshold, onSwipeLeft, onSwipeRight],
  )

  return {
    onTouchStart,
    onTouchEnd,
    className: 'touch-pan-y',
  }
}
