'use client'

import { usePathname } from 'next/navigation'
import NavigationTabs from '@/components/NavigationTabs'

/**
 * Routes where the main app bottom nav should appear (single mount, shared across navigations).
 * Excludes /admin — that layout mounts its own nav + chrome.
 */
const PREFIXES = [
  '/profile',
  '/dashboard',
  '/notifications',
  '/credits',
  '/buy-credits',
  '/contact',
  '/apply-event-creator',
  '/bookings',
  '/events',
  '/settings',
  '/venues',
  '/communities',
] as const

function matchesShellRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function AppNavigationShell() {
  const pathname = usePathname()
  if (!matchesShellRoute(pathname)) return null
  return <NavigationTabs />
}
