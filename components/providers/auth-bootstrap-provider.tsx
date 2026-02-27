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
  const [debugOpen, setDebugOpen] = useState(false)
  const [debugLines, setDebugLines] = useState<string[]>([])

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

    const pushDebug = (label: string, payload: unknown) => {
      const rendered = `${label}: ${JSON.stringify(payload)}`
      console.info(`[auth-bootstrap] ${label}`, payload)
      setDebugLines((prev) => [...prev.slice(-11), rendered])
    }

    pushDebug('cold-start localStorage snapshot', getSupabaseStorageSnapshot())

    const resolveOnce = () => {
      if (resolved || !mounted) return
      resolved = true
      setAuthResolved(true)
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      if (!firstAuthEventLogged) {
        firstAuthEventLogged = true
        pushDebug('first onAuthStateChange event', {
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
      pushDebug('getSession() initial result', {
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
      pushDebug('fallback getSession() result', summarizeSession(data.session ?? null))
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

  return (
    <AuthBootstrapContext.Provider value={value}>
      {children}
      <div className="fixed bottom-24 right-3 z-[9999] max-w-[90vw]">
        {!debugOpen ? (
          <button
            type="button"
            onClick={() => setDebugOpen(true)}
            className="rounded-md bg-black/80 px-3 py-1.5 text-xs text-white"
          >
            Auth debug
          </button>
        ) : (
          <div className="w-[360px] max-w-[90vw] rounded-md border bg-black/90 p-2 text-[11px] text-white shadow-lg">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">Auth Bootstrap Debug</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDebugLines([])}
                  className="rounded bg-white/20 px-2 py-0.5"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setDebugOpen(false)}
                  className="rounded bg-white/20 px-2 py-0.5"
                >
                  Hide
                </button>
              </div>
            </div>
            <div className="max-h-56 space-y-1 overflow-auto pr-1">
              {debugLines.length === 0 ? (
                <div className="text-white/70">No events logged yet.</div>
              ) : (
                debugLines.map((line, index) => (
                  <pre key={`${index}-${line.slice(0, 24)}`} className="whitespace-pre-wrap break-words text-[10px]">
                    {line}
                  </pre>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </AuthBootstrapContext.Provider>
  )
}

export function useAuthBootstrap() {
  const context = useContext(AuthBootstrapContext)
  if (!context) {
    throw new Error('useAuthBootstrap must be used within AuthBootstrapProvider')
  }
  return context
}

