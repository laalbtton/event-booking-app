'use client'

import { usePathname } from 'next/navigation'
import NavigationTabs from '@/components/NavigationTabs'
import { matchesAppShellRoute } from '@/lib/appShellRoutes'

export default function AppNavigationShell() {
  const pathname = usePathname()
  if (!matchesAppShellRoute(pathname)) return null
  return <NavigationTabs />
}
