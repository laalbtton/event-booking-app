'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthBootstrap } from '@/components/providers/auth-bootstrap-provider'
import { useConfirmDialog } from '@/components/providers/confirm-dialog-provider'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ChevronLeft, Megaphone } from 'lucide-react'
import { toast } from 'sonner'

export default function PushBroadcastSettingsPage() {
  const { authResolved, user } = useAuthBootstrap()
  const router = useRouter()
  const { confirm } = useConfirmDialog()
  const [allowed, setAllowed] = useState(false)
  const [checking, setChecking] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [url, setUrl] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!authResolved) return
    if (!user) {
      router.push('/login')
      return
    }
    void (async () => {
      try {
        const [{ data: profile }, { data: adminRow }] = await Promise.all([
          supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          supabase.from('admin_users').select('id').eq('user_id', user.id).maybeSingle(),
        ])
        const ok = (profile as { role?: string } | null)?.role === 'admin' || !!adminRow
        setAllowed(ok)
        if (!ok) toast.error('Super admin only')
      } finally {
        setChecking(false)
      }
    })()
  }, [authResolved, user, router])

  async function handleSend() {
    const t = title.trim()
    const b = body.trim()
    if (!t) {
      toast.error('Enter a notification title')
      return
    }
    if (!b) {
      toast.error('Enter the message body')
      return
    }

    const ok = await confirm({
      title: 'Send push to all users?',
      message: `This will send a push notification to every subscribed device (category preferences ignored).\n\nTitle: ${t}\n\n${b.slice(0, 200)}${b.length > 200 ? '…' : ''}`,
      confirmText: 'Send now',
      variant: 'destructive',
    })
    if (!ok) return

    setSending(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Not authenticated')

      const res = await fetch('/api/admin/push-broadcast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: t,
          body: b,
          ...(url.trim() ? { url: url.trim() } : {}),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Send failed')

      toast.success(
        `Push complete: ${json.sent ?? 0} notification(s) delivered, ${json.failed ?? 0} failed.`
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to send')
    } finally {
      setSending(false)
    }
  }

  if (!authResolved || checking) {
    return (
      <div className="min-h-screen bg-background pb-20 flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background pb-20 max-w-lg mx-auto px-4 py-8">
        <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-6">
          <ChevronLeft className="w-4 h-4" />
          Back to settings
        </Link>
        <p className="text-sm">You do not have access to this page.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-20 max-w-lg mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="p-1 -ml-1 rounded hover:bg-muted shrink-0" aria-label="Back to settings">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Megaphone className="w-5 h-5" />
          Broadcast push
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Custom notification</CardTitle>
          <CardDescription>
            Sends a web push to all users with an active subscription. In-app category toggles are ignored so the message reaches everyone who enabled notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="push-title">Title</Label>
            <Input
              id="push-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Holiday hours update"
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="push-body">Message</Label>
            <Textarea
              id="push-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Message shown in the push notification…"
              rows={5}
              maxLength={2000}
              className="resize-y min-h-[120px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="push-url">Open path (optional)</Label>
            <Input
              id="push-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/events or /dashboard"
            />
            <p className="text-xs text-muted-foreground">Must start with / — opens inside the app when the user taps the notification.</p>
          </div>
          <Button type="button" className="w-full sm:w-auto" disabled={sending} onClick={() => void handleSend()}>
            {sending ? 'Sending…' : 'Send & confirm…'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
