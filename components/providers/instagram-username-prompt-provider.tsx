'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { profileHasInstagramUsername } from '@/lib/instagramUsername'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

const AUTH_PREFIXES = ['/login', '/signup', '/auth/']
const SESSION_SUPPRESS_KEY = 'instagram_username_prompt_session_suppress'

function pathShouldSkipPrompt(pathname: string | null) {
  if (!pathname) return true
  return AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function InstagramUsernamePromptProvider({ children }: { children: React.ReactNode }) {
  const { authResolved, user } = useAuthBootstrap()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [platformEnabled, setPlatformEnabled] = useState(true)
  const [checking, setChecking] = useState(true)
  const [usernameInput, setUsernameInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const evaluate = useCallback(async () => {
    if (!authResolved || !user || pathShouldSkipPrompt(pathname)) {
      setOpen(false)
      setChecking(false)
      return
    }

    setChecking(true)
    try {
      const [flagRes, profileRes] = await Promise.all([
        fetch('/api/public/instagram-username-prompt'),
        supabase
          .from('profiles')
          .select('instagram_link, instagram_prompt_snoozed_until, instagram_no_account')
          .eq('id', user.id)
          .single(),
      ])

      const flagJson = await flagRes.json().catch(() => ({}))
      const enabled = flagJson.enabled !== false
      setPlatformEnabled(enabled)

      if (!enabled) {
        setOpen(false)
        return
      }

      if (profileRes.error || !profileRes.data) {
        setOpen(false)
        return
      }

      const row = profileRes.data as {
        instagram_link: string | null
        instagram_prompt_snoozed_until: string | null
        instagram_no_account: boolean
      }

      if (profileHasInstagramUsername(row.instagram_link)) {
        setOpen(false)
        return
      }

      if (row.instagram_no_account) {
        setOpen(false)
        return
      }

      if (row.instagram_prompt_snoozed_until) {
        const until = new Date(row.instagram_prompt_snoozed_until)
        if (!Number.isNaN(until.getTime()) && until > new Date()) {
          setOpen(false)
          return
        }
      }

      if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_SUPPRESS_KEY) === '1') {
        setOpen(false)
        return
      }

      setOpen(true)
    } finally {
      setChecking(false)
    }
  }, [authResolved, user, pathname])

  useEffect(() => {
    void evaluate()
  }, [evaluate])

  async function postAction(action: 'save' | 'snooze' | 'no_account', username?: string) {
    setSubmitting(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Not authenticated')

      const res = await fetch('/api/profile/instagram-username-prompt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(
          action === 'save' ? { action, username: username?.trim() } : { action }
        ),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Something went wrong')

      if (action === 'save') toast.success('Instagram saved to your profile')
      if (action === 'snooze') toast.info("We'll remind you in about a week.")
      if (action === 'no_account') toast.info('Preference saved.')

      if (typeof window !== 'undefined') {
        if (action === 'save' || action === 'snooze' || action === 'no_account') {
          sessionStorage.removeItem(SESSION_SUPPRESS_KEY)
        }
      }

      setOpen(false)
      await evaluate()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {children}
      <Dialog open={open && !checking && platformEnabled}>
        <DialogContent
          className="sm:max-w-md"
          showCloseButton={false}
          onPointerDownOutside={(e) => {
            e.preventDefault()
            void postAction('snooze')
          }}
          onEscapeKeyDown={(e) => {
            e.preventDefault()
            void postAction('snooze')
          }}
        >
          <DialogHeader>
            <DialogTitle>Add your Instagram</DialogTitle>
            <DialogDescription>
              We use Instagram handles on profiles and for lineups. Add your username so hosts and other performers can
              find you. You can also edit this anytime on{' '}
              <Link href="/profile" className="text-primary underline font-medium">
                your profile
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="instagram-prompt-username">Instagram username</Label>
            <Input
              id="instagram-prompt-username"
              placeholder="yourname (without @)"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              autoComplete="off"
              disabled={submitting}
            />
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              type="button"
              disabled={submitting || !usernameInput.trim()}
              className="w-full"
              onClick={() => void postAction('save', usernameInput)}
            >
              Save to profile
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={submitting} asChild>
              <Link
                href="/profile"
                onClick={() => {
                  if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_SUPPRESS_KEY, '1')
                  setOpen(false)
                }}
              >
                Open profile
              </Link>
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={submitting}
              onClick={() => void postAction('no_account')}
            >
              I don&apos;t have Instagram
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              disabled={submitting}
              onClick={() => void postAction('snooze')}
            >
              Dismiss (remind me later)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
