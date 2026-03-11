'use client'

import { useEffect, useRef } from 'react'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { supabase } from '@/lib/supabase'
import { isStandaloneMode } from '@/lib/installPromptClient'
import { toast } from 'sonner'

export function InstallBonusProvider() {
  const { authResolved, user } = useAuthBootstrap()
  const claimedRef = useRef(false)

  useEffect(() => {
    if (!authResolved || !user || !isStandaloneMode()) return
    if (claimedRef.current) return

    let cancelled = false
    claimedRef.current = true

    async function claimInstallBonus() {
      try {
        const { data: sessionData } = await supabase.auth.getSession()
        const token = sessionData.session?.access_token
        if (!token || cancelled) return

        const res = await fetch('/api/credits/install-bonus', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok && data.success && !data.alreadyGranted) {
          toast.success('You earned 5 free credits for installing the app!')
        }
      } catch {
        // Silent fail
      }
    }
    void claimInstallBonus()
    return () => { cancelled = true }
  }, [authResolved, user])

  return null
}
