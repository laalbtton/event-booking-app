'use client'

import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'

type Props = { children: React.ReactNode }

/**
 * Wraps the server-rendered visible event summary in the event layout.
 * Hides itself once auth resolves and a logged-in user is detected,
 * so the full interactive page.tsx content is the only thing visible
 * for authenticated users (no duplicate content).
 * Before auth resolves the content remains visible — correct for crawlers
 * and logged-out visitors on first paint.
 */
export function LayoutEventSummary({ children }: Props) {
  const { authResolved, user } = useAuthBootstrap()

  if (authResolved && user) return null

  return <>{children}</>
}
