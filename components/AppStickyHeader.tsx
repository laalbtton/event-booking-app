'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { matchesAppShellRoute } from '@/lib/appShellRoutes'

export default function AppStickyHeader() {
  const pathname = usePathname()
  const { authResolved, user } = useAuthBootstrap()
  const [displayName, setDisplayName] = useState('')
  const [chatOverlayOpen, setChatOverlayOpen] = useState(false)

  useEffect(() => {
    const check = () => setChatOverlayOpen(document.body.classList.contains('chat-overlay-open'))
    const observer = new MutationObserver(check)
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    check()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!authResolved || !user?.id) {
      setDisplayName('')
      return
    }
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      if (cancelled) return
      const metaName =
        typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : ''
      const fromProfile = (data?.full_name || '').trim()
      setDisplayName(fromProfile || metaName || 'Account')
    })()
    return () => {
      cancelled = true
    }
  }, [authResolved, user])

  // Home (/profile) uses a single sticky bar with actions on the profile page.
  if (pathname === '/profile') return null

  if (!matchesAppShellRoute(pathname) || !authResolved || !user || chatOverlayOpen) {
    return null
  }

  return (
    <header className="sticky top-0 z-[45] border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-11 flex items-center">
        <p className="text-sm font-semibold tracking-tight truncate">{displayName || '…'}</p>
      </div>
    </header>
  )
}
