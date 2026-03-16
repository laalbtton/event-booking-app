'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'

/**
 * Invisible client component — redirects logged-in users to /dashboard.
 * Renders nothing; placed inside the SSR home page so the public content
 * is visible to crawlers and logged-out visitors immediately.
 */
export function HomeAuthRedirect() {
  const router = useRouter()
  const { authResolved, user } = useAuthBootstrap()

  useEffect(() => {
    if (authResolved && user) {
      router.replace('/dashboard')
    }
  }, [authResolved, user, router])

  return null
}
