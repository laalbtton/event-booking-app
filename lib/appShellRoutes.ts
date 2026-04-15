/**
 * Routes where the main app chrome (sticky header + bottom nav) appears.
 * Excludes /admin — that layout mounts its own nav.
 */
export const APP_SHELL_ROUTE_PREFIXES = [
  '/profile',
  '/dashboard',
  '/jokes',
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

export function matchesAppShellRoute(pathname: string | null): boolean {
  if (!pathname) return false
  return APP_SHELL_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}
