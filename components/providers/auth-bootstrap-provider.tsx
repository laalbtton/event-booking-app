'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

type AuthBootstrapContextValue = {
  authResolved: boolean
  session: Session | null
  user: User | null
}

const AuthBootstrapContext = createContext<AuthBootstrapContextValue | null>(null)

export function AuthBootstrapProvider({ children }: { children: React.ReactNode }) {
  const [authResolved, setAuthResolved] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    let mounted = true
    let resolved = false

    const resolveOnce = () => {
      if (resolved || !mounted) return
      resolved = true
      setAuthResolved(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      resolveOnce()
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
    })

    const fallbackTimer = window.setTimeout(async () => {
      if (!mounted || resolved) return
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
      resolveOnce()
    }, 1200)

    return () => {
      mounted = false
      window.clearTimeout(fallbackTimer)
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({ authResolved, session, user }),
    [authResolved, session, user]
  )

  return <AuthBootstrapContext.Provider value={value}>{children}</AuthBootstrapContext.Provider>
}

export function useAuthBootstrap() {
  const context = useContext(AuthBootstrapContext)
  if (!context) {
    throw new Error('useAuthBootstrap must be used within AuthBootstrapProvider')
  }
  return context
}

