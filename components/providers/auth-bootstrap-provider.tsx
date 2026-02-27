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
    let firstAuthEventLogged = false

    const summarizeSession = (currentSession: Session | null) => ({
      hasSession: !!currentSession,
      userId: currentSession?.user?.id || null,
      expiresAt: currentSession?.expires_at || null,
    })

    const getSupabaseStorageSnapshot = () => {
      if (typeof window === 'undefined') return []
      const allKeys = Object.keys(window.localStorage)
      const keys = Object.keys(window.localStorage).filter((key) => key.startsWith('sb-'))
      const supabaseKeys = keys.map((key) => {
        const raw = window.localStorage.getItem(key) || ''
        return {
          key,
          valueLength: raw.length,
          hasAccessTokenText: raw.includes('access_token'),
        }
      })
      return {
        allLocalStorageKeys: allKeys,
        supabaseKeys,
      }
    }

    console.info('[auth-bootstrap] cold-start localStorage snapshot', getSupabaseStorageSnapshot())

    const resolveOnce = () => {
      if (resolved || !mounted) return
      resolved = true
      setAuthResolved(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      if (!firstAuthEventLogged) {
        firstAuthEventLogged = true
        console.info('[auth-bootstrap] first onAuthStateChange event', {
          event,
          ...summarizeSession(nextSession ?? null),
        })
      }
      setSession(nextSession ?? null)
      setUser(nextSession?.user ?? null)
      resolveOnce()
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      console.info('[auth-bootstrap] getSession() initial result', {
        beforeFirstAuthEvent: !firstAuthEventLogged,
        ...summarizeSession(data.session ?? null),
      })
      setSession(data.session ?? null)
      setUser(data.session?.user ?? null)
    })

    const fallbackTimer = window.setTimeout(async () => {
      if (!mounted || resolved) return
      const { data } = await supabase.auth.getSession()
      if (!mounted) return
      console.info('[auth-bootstrap] fallback getSession() result', summarizeSession(data.session ?? null))
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

