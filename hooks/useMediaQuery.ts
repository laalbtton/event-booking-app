'use client'

import { useEffect, useState } from 'react'

/**
 * Returns true when viewport width is below 768px (Tailwind md breakpoint).
 * SSR-safe: assumes mobile initially to avoid desktop-only redirects firing on mobile
 * before hydration. Updates to actual value after first paint.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setIsMobile(mq.matches)

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return isMobile
}
